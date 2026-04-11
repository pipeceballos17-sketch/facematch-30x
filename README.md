# Facematch 30X

> Sube las fotos de un evento, la IA detecta quién aparece en cada una y las entrega organizadas por persona — con su nombre y teléfono.

---

## ¿Qué hace?

En los eventos del **Inmersivo Ejecutivo** nuestro equipo toma cientos de fotos, pero no sabemos a quién enviarle cada una. Este sistema resuelve eso:

1. **Cargas la lista de participantes** (CSV con nombre y teléfono, o uno por uno)
2. **El sistema busca su foto en LinkedIn** automáticamente
3. **Subes un ZIP** con todas las fotos del evento
4. **La IA detecta las caras** y hace el match
5. **Descargas las fotos por persona** — o un CSV con nombre, teléfono y qué fotos les corresponden

---

## Requisitos

| Herramienta | Versión mínima | Para qué |
|---|---|---|
| Python | 3.10 o 3.11 | Backend + IA |
| Node.js | 18+ | Frontend |
| ~2 GB de espacio | — | Modelos de IA (se descargan una sola vez) |

---

## Instalación

### 1. Clonar / descomprimir el proyecto

Asegúrate de tener la carpeta `Facematch 30X` en tu máquina.

### 2. Backend

Abre una terminal y ejecuta:

```bash
cd "Facematch 30X/backend"

# Crear entorno virtual (solo la primera vez)
python -m venv venv

# Activar entorno virtual
# En Mac/Linux:
source venv/bin/activate
# En Windows:
venv\Scripts\activate

# Instalar dependencias (solo la primera vez — tarda ~5 min)
pip install -r requirements.txt

# Iniciar el servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verás algo como:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 3. Frontend

Abre **otra terminal** y ejecuta:

```bash
cd "Facematch 30X/frontend"

# Instalar dependencias (solo la primera vez)
npm install

# Iniciar la interfaz
npm run dev
```

Abre tu navegador en **http://localhost:5173**

---

## Cómo usarlo

### Paso 1 — Crear un cohort

Un **cohort** es un grupo de eventos del mismo programa. Ej: "Inmersivo Ejecutivo Q2 2025".

1. En la pantalla principal, haz clic en **"New Cohort"**
2. Ponle nombre, selecciona el tipo de programa y una descripción opcional
3. Listo — ahí adentro vivirán todos los eventos de ese programa

---

### Paso 2 — Agregar participantes

Ve a la pestaña **Participants** y elige cómo cargarlos:

#### Opción A — CSV (recomendado para grupos grandes)

Descarga la plantilla y llénala:

```
name,phone,company,linkedin_url
María García,+52 55 1234 5678,30X,
John Smith,+1 415 555 0100,Acme,https://linkedin.com/in/john
```

- `name` → requerido
- `phone` → el número que usaremos para entregar fotos por WhatsApp
- `company` → opcional, mejora la búsqueda en LinkedIn
- `linkedin_url` → si ya lo tienes, lo usa directo y no busca

Sube el CSV con el botón **"Import CSV"**. El sistema:
- Crea a todos los participantes instantáneamente
- Busca cada perfil en LinkedIn en paralelo
- Descarga la foto de perfil automáticamente
- Los que no encontró quedan marcados para foto manual

#### Opción B — Uno por uno

Haz clic en **"Add Participant"**, llena nombre y teléfono, y busca su LinkedIn desde ahí.

#### Si LinkedIn no funciona (perfil privado)

En la tarjeta de cada participante aparece el botón **"Upload"** — sube cualquier foto de frente clara (foto de su registro, perfil de otra red, etc.).

> **Tip:** Para mejores resultados usa fotos de frente, sin lentes de sol, bien iluminadas.

---

### Paso 3 — Subir fotos del evento

1. Entra al cohort que creaste
2. Haz clic en **"Upload Event"**
3. Ponle nombre al evento (ej: "Sesión 1 — Liderazgo")
4. Comprime todas las fotos del evento en un `.zip` y arrástralo

El sistema procesa en segundo plano y muestra el progreso en tiempo real.

> **Primera vez:** Los modelos de IA se descargan (~500 MB). Puede tardar unos minutos. Las siguientes veces es mucho más rápido.

---

### Paso 4 — Ver y descargar resultados

Cuando termina el procesamiento, dentro del cohort puedes hacer clic en el evento y ver:

- **Cuántas fotos se detectaron y matchearon**
- **Lista de participantes con su teléfono y cuántas fotos les corresponden**
- **Botón WhatsApp** — abre un chat directo con esa persona
- **Descargar fotos** de cada persona individualmente
- **Descargar todo** — un ZIP con carpetas por persona
- **CSV de nombre + teléfono** — una hoja con quién aparece en qué fotos, lista para compartir con el equipo

---

## Estructura del proyecto

```
Facematch 30X/
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py          # API (FastAPI)
│   │   ├── face_engine.py   # Motor de reconocimiento facial (DeepFace)
│   │   ├── linkedin.py      # Búsqueda y descarga de fotos de LinkedIn
│   │   ├── cohorts.py       # Gestión de cohorts
│   │   └── models.py        # Modelos de datos
│   ├── storage/             # Fotos, embeddings y resultados (se crea automático)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    └── src/
        ├── App.jsx
        ├── api.js
        └── components/
            ├── CohortFeed.jsx       # Pantalla principal con cohorts
            ├── CohortDetail.jsx     # Vista de un cohort (eventos + resultados)
            ├── CreateCohortModal.jsx
            ├── ParticipantCard.jsx
            ├── AddParticipantModal.jsx
            ├── ImportCSVModal.jsx   # Importación masiva desde CSV
            ├── UploadZip.jsx        # Carga de fotos del evento
            └── Results.jsx          # Resultados con teléfono + WhatsApp
```

---

## LinkedIn — qué esperar

El sistema intenta obtener la foto de perfil de LinkedIn de dos formas:

| Método | Cuándo funciona |
|---|---|
| Scraping directo | El perfil es público en LinkedIn |
| Proxycurl API | Siempre (requiere clave de API, ~$0.01 por perfil) |

Para activar Proxycurl:
1. Crea una cuenta en [nubela.co/proxycurl](https://nubela.co/proxycurl) (tienen free tier)
2. Copia tu API key
3. Crea el archivo `backend/.env` con:
   ```
   PROXYCURL_API_KEY=tu_clave_aqui
   ```
4. Reinicia el backend

Si LinkedIn falla para alguien, el sistema lo marca y puedes subir su foto manualmente — siempre hay fallback.

---

## Ajustes de precisión del reconocimiento facial

En `backend/app/face_engine.py` puedes ajustar:

```python
MODEL_NAME       = "ArcFace"   # Más preciso. Alternativa: "VGG-Face" (más rápido)
DETECTOR_BACKEND = "opencv"    # Más rápido. Alternativa: "retinaface" (más preciso)
THRESHOLD        = 0.40        # Más bajo = más estricto (menos falsos positivos)
```

**Guía rápida:**
- Si hay muchos falsos positivos (personas equivocadas) → bajar el threshold a `0.35`
- Si se pierden muchas fotos (personas que sí estaban) → subir el threshold a `0.50`
- Para grupos grandes con muchas caras → usar `retinaface` como detector

---

## Preguntas frecuentes

**¿Las fotos se envían a algún servidor externo?**
No. Todo corre en tu máquina local. Las fotos nunca salen de tu computadora.

**¿Puedo tener múltiples eventos en un mismo cohort?**
Sí, esa es la idea. Cada cohort puede tener tantos eventos como quieras (sesión 1, sesión 2, clausura, etc.).

**¿Una persona puede aparecer en las fotos de varios eventos?**
Sí. Sus fotos se guardan por evento, no mezcladas.

**¿Qué pasa si una foto tiene varias personas?**
Se detectan todas las caras y cada persona matcheada recibe esa foto en su carpeta. Una misma foto puede ir a múltiples personas.

**¿Funciona con fotos de baja calidad?**
La cara debe tener al menos ~80×80 píxeles en la foto. Fotos borrosas o de perfil funcionan peor.

---

## Soporte

Si algo no funciona, revisa:
1. Que el backend esté corriendo (terminal con `uvicorn`)
2. Que el frontend esté corriendo (terminal con `npm run dev`)
3. Que el entorno virtual de Python esté activado (`venv\Scripts\activate`)
4. Que las dependencias estén instaladas (`pip install -r requirements.txt`)
