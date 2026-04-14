"""
LinkedIn profile search and profile picture extraction.

Strategy:
1. Google search for "{name} site:linkedin.com/in" to find the LinkedIn profile URL
2. Fetch the LinkedIn public profile page and extract the og:image meta tag
   (works for public profiles without login)
3. Download the profile picture

Note: LinkedIn heavily restricts scraping. For production use, consider:
- Proxycurl API (paid, reliable): https://nubela.co/proxycurl
- LinkedIn Marketing API (requires partnership)
- Manual photo upload as fallback (always available in the UI)
"""

import httpx
import re
import os
from typing import Optional, List
from bs4 import BeautifulSoup
from app.models import LinkedInSearchResult
import logging

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

PROXYCURL_API_KEY = os.getenv("PROXYCURL_API_KEY", "")
APIFY_API_KEY     = os.getenv("APIFY_API_KEY", "")
APIFY_ACTOR       = "anchor~linkedin-profile-enrichment"


async def search_linkedin_google(name: str, company: Optional[str] = None) -> List[LinkedInSearchResult]:
    """
    Search for LinkedIn profiles by name.
    Uses Apify Google Search when APIFY_API_KEY is set (reliable).
    Falls back to direct DuckDuckGo scraping (may be blocked).
    """
    if APIFY_API_KEY:
        return await _search_linkedin_apify(name, company)
    return await _search_linkedin_direct(name, company)


async def _search_linkedin_apify(name: str, company: Optional[str] = None) -> List[LinkedInSearchResult]:
    """Use Apify's Google Search scraper to find LinkedIn profile URLs."""
    import asyncio

    query = f"{name} site:linkedin.com/in"
    if company:
        query += f" {company}"

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(
                "https://api.apify.com/v2/acts/apify~google-search-scraper/runs",
                params={"token": APIFY_API_KEY, "memory": 256},
                json={"queries": query, "resultsPerPage": 5, "maxPagesPerQuery": 1},
            )
            r.raise_for_status()
            run_id = r.json()["data"]["id"]
        except Exception as e:
            logger.warning(f"Apify search: failed to start: {e}")
            return []

    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(15):
            await asyncio.sleep(4)
            try:
                s = await client.get(
                    f"https://api.apify.com/v2/actor-runs/{run_id}",
                    params={"token": APIFY_API_KEY},
                )
                status = s.json()["data"]["status"]
                if status == "SUCCEEDED":
                    break
                if status in ("FAILED", "ABORTED", "TIMED-OUT"):
                    logger.warning(f"Apify search run ended: {status}")
                    return []
            except Exception:
                continue
        else:
            return []

        try:
            ds = await client.get(
                f"https://api.apify.com/v2/actor-runs/{run_id}/dataset/items",
                params={"token": APIFY_API_KEY},
            )
            items = ds.json()
        except Exception as e:
            logger.warning(f"Apify search: dataset fetch failed: {e}")
            return []

    results: List[LinkedInSearchResult] = []
    seen_urls: set = set()
    for item in items:
        for res in item.get("organicResults", []):
            url = res.get("url", "")
            m = re.search(r"linkedin\.com/in/([^/?&\"'\s<>]+)", url)
            if m:
                li_url = f"https://www.linkedin.com/in/{m.group(1)}"
                if li_url not in seen_urls:
                    seen_urls.add(li_url)
                    results.append(LinkedInSearchResult(
                        name=name,
                        headline=(res.get("description") or "")[:120] or None,
                        linkedin_url=li_url,
                    ))
            if len(results) >= 5:
                break
        if len(results) >= 5:
            break

    return results


async def _search_linkedin_direct(name: str, company: Optional[str] = None) -> List[LinkedInSearchResult]:
    """Fallback: scrape DuckDuckGo directly (may be blocked by bot detection)."""
    query = f"{name} site:linkedin.com/in"
    if company:
        query += f" {company}"

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query, "b": "", "kl": "us-en"},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning(f"DuckDuckGo search failed: {e}")
            return []

    soup = BeautifulSoup(resp.text, "html.parser")
    results: List[LinkedInSearchResult] = []
    seen_urls: set = set()
    for a in soup.find_all("a", href=True):
        m = re.search(r"https://(?:www\.)?linkedin\.com/in/([^&\"'/ ]+)", a["href"])
        if m:
            li_url = f"https://www.linkedin.com/in/{m.group(1)}"
            if li_url not in seen_urls:
                seen_urls.add(li_url)
                results.append(LinkedInSearchResult(
                    name=name,
                    headline=a.get_text(strip=True)[:120] or None,
                    linkedin_url=li_url,
                ))
        if len(results) >= 5:
            break
    return results


async def fetch_linkedin_profile_pic(linkedin_url: str) -> Optional[str]:
    """
    Try to get the profile picture URL from a LinkedIn public profile.
    LinkedIn's public pages include og:image with the profile photo.
    Returns the image URL if found.
    """
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.get(linkedin_url)
            resp.raise_for_status()
        except Exception as e:
            logger.warning(f"Could not fetch LinkedIn profile {linkedin_url}: {e}")
            return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try og:image first
    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        url = og_image["content"]
        # LinkedIn default ghost image check
        if "ghost" not in url and "static" not in url:
            return url

    # Try JSON-LD data
    for script in soup.find_all("script", type="application/ld+json"):
        import json
        try:
            data = json.loads(script.string or "")
            if isinstance(data, dict):
                img = data.get("image") or data.get("photo")
                if isinstance(img, str):
                    return img
                if isinstance(img, dict):
                    return img.get("url")
        except Exception:
            pass

    return None


async def fetch_profile_pic_proxycurl(linkedin_url: str) -> Optional[str]:
    """
    Use Proxycurl API to get profile picture (requires PROXYCURL_API_KEY env var).
    More reliable than scraping.
    """
    if not PROXYCURL_API_KEY:
        return None

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            resp = await client.get(
                "https://nubela.co/proxycurl/api/v2/linkedin",
                params={"url": linkedin_url, "extra": "include"},
                headers={"Authorization": f"Bearer {PROXYCURL_API_KEY}"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("profile_pic_url")
        except Exception as e:
            logger.warning(f"Proxycurl failed: {e}")
            return None


async def fetch_profile_pic_apify(linkedin_url: str) -> Optional[str]:
    """
    Use Apify anchor~linkedin-profile-enrichment to get the profile picture URL.
    Requires APIFY_API_KEY env var.
    Uses run → poll → dataset pattern (sync endpoint unreliable for this actor).
    """
    if not APIFY_API_KEY:
        return None

    import asyncio

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            # 1. Launch run
            r = await client.post(
                f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/runs",
                params={"token": APIFY_API_KEY, "memory": 256},
                json={"profileUrls": [linkedin_url]},
            )
            r.raise_for_status()
            run_id = r.json()["data"]["id"]
        except Exception as e:
            logger.warning(f"Apify: failed to start run for {linkedin_url}: {e}")
            return None

    # 2. Poll until done (max 60 s)
    async with httpx.AsyncClient(timeout=15) as client:
        for _ in range(15):
            await asyncio.sleep(4)
            try:
                s = await client.get(
                    f"https://api.apify.com/v2/actor-runs/{run_id}",
                    params={"token": APIFY_API_KEY},
                )
                status = s.json()["data"]["status"]
                if status == "SUCCEEDED":
                    break
                if status in ("FAILED", "ABORTED", "TIMED-OUT"):
                    logger.warning(f"Apify run {run_id} ended with status: {status}")
                    return None
            except Exception:
                continue
        else:
            logger.warning(f"Apify run {run_id} timed out waiting")
            return None

        # 3. Fetch dataset
        try:
            ds = await client.get(
                f"https://api.apify.com/v2/actor-runs/{run_id}/dataset/items",
                params={"token": APIFY_API_KEY},
            )
            ds.raise_for_status()
            items = ds.json()
            if not items:
                logger.warning(f"Apify: empty dataset for {linkedin_url}")
                return None
            pic = items[0].get("profile_pic_url")
            if pic and isinstance(pic, str) and pic.startswith("http"):
                return pic
            logger.warning(f"Apify: no profile_pic_url in result for {linkedin_url}")
            return None
        except Exception as e:
            logger.warning(f"Apify: failed to fetch dataset for run {run_id}: {e}")
            return None


async def download_image(url: str, dest_path: str) -> bool:
    """Download an image from a URL to disk. Returns True on success."""
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=20) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "image" not in content_type and "octet-stream" not in content_type:
                logger.warning(f"URL did not return an image: {content_type}")
                return False
            with open(dest_path, "wb") as f:
                f.write(resp.content)
            return True
        except Exception as e:
            logger.warning(f"Image download failed from {url}: {e}")
            return False


async def get_profile_pic_url(linkedin_url: str) -> Optional[str]:
    """
    Priority:
    1. Proxycurl (if PROXYCURL_API_KEY set) — más rápido
    2. Apify     (if APIFY_API_KEY set)     — muy confiable
    3. Scraping directo                      — funciona solo con perfiles públicos
    """
    if PROXYCURL_API_KEY:
        url = await fetch_profile_pic_proxycurl(linkedin_url)
        if url:
            return url
    if APIFY_API_KEY:
        url = await fetch_profile_pic_apify(linkedin_url)
        if url:
            return url
    return await fetch_linkedin_profile_pic(linkedin_url)
