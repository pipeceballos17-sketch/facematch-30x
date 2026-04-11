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


async def search_linkedin_google(name: str, company: Optional[str] = None) -> List[LinkedInSearchResult]:
    """Search Google for LinkedIn profiles matching a name."""
    query = f"{name} site:linkedin.com/in"
    if company:
        query += f" {company}"

    url = f"https://www.google.com/search?q={httpx.QueryParams({'q': query})}&num=5"

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=15) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except Exception as e:
            logger.warning(f"Google search failed: {e}")
            return []

    soup = BeautifulSoup(resp.text, "html.parser")
    results: List[LinkedInSearchResult] = []

    # Extract LinkedIn URLs from Google search results
    seen_urls = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # Google wraps links in /url?q=...
        match = re.search(r"https://(?:www\.)?linkedin\.com/in/([^&\"'/]+)", href)
        if match:
            li_url = f"https://www.linkedin.com/in/{match.group(1)}"
            if li_url in seen_urls:
                continue
            seen_urls.add(li_url)

            # Try to get the text around this link as the name/headline
            parent_text = a.get_text(strip=True) or name
            results.append(LinkedInSearchResult(
                name=name,
                headline=parent_text[:120] if parent_text != name else None,
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
    """Try Proxycurl first (if key set), then direct scraping."""
    if PROXYCURL_API_KEY:
        url = await fetch_profile_pic_proxycurl(linkedin_url)
        if url:
            return url
    return await fetch_linkedin_profile_pic(linkedin_url)
