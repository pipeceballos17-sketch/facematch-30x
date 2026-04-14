# Facematch 30X

Sistema de reconocimiento facial para eventos 30X.  
Los participantes suben una selfie y descargan automáticamente todas las fotos del evento donde aparecen.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI + DeepFace (ArcFace) |
| Frontend | React + Vite + Tailwind CSS |
| Almacenamiento | Sistema de archivos local (JSON + imágenes) |

---

## Cómo funciona

### Admin (panel interno)

1. Crear un **Cohort** — agrupa todos los eventos de un mismo programa (ej. "Inmersivo Ejecutivo Q2 2025")
2. Agregar **Participantes** — manualmente, por CSV, o buscando en LinkedIn para obtener foto automáticamente
3. Dentro del cohort, hacer clic en **"Subir Evento"** y arrastrar un ZIP o fotos sueltas
4. El backend indexa todas las caras detectadas y las guarda en `face_index.json`
5. Compartir el link del portal con los participantes

### Participante (portal público)

1. Entra al link del portal (`/#portal` o `/#portal/{cohort_id}`)
2. Selecciona su cohort y el evento donde estuvo
3. Sube una selfie
4. El sistema compara la selfie contra el índice de caras del evento
5. Descarga todas las fotos donde aparece

---

## Instalación

### Requisitos

| Herramienta | Versión mínima |
|---|---|
| Python | 3.10 o 3.11 |
| Node.js | 18+ |
| Espacio en disco | ~2 GB (modelos de IA, se descargan una sola vez) |

### Backend

```bash
cd "Facematch 30X/backend"

# Crear entorno virtual (solo la primera vez)
python -m venv venv

# Activar — Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Levantar el servidor
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> La primera vez que se procese un evento, DeepFace descarga el modelo ArcFace (~250 MB). Las siguientes veces arranca en segundos.

### Frontend

```bash
cd "Facematch 30X/frontend"
npm install
npm run dev
```

| URL | Qué es |
|-----|--------|
| `http://localhost:5173` | Panel de administración |
| `http://localhost:5173/#portal` | Portal público (landing de cohorts) |
| `http://localhost:5173/#portal/{cohort_id}` | Portal directo a un cohort |

---

## Estructura del proyecto

```
Facematch 30X/
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py          # Endpoints FastAPI
│   │   ├── face_engine.py   # Motor de reconocimiento facial (DeepFace + ArcFace)
│   │   ├── cohorts.py       # CRUD de cohorts
│   │   ├── linkedin.py      # Búsqueda y descarga de fotos de LinkedIn
│   │   └── models.py        # Modelos Pydantic
│   ├── storage/             # Datos locales — ignorado en git
│   │   ├── participants/    # Fotos de referencia + embeddings (.npy)
│   │   ├── events/          # Fotos originales del evento
│   │   └── results/         # face_index.json + result.json por evento
│   ├── requirements.txt
│   └── start.bat
└── frontend/
    ├── src/
    │   ├── App.jsx                    # Admin panel + enrutamiento hash
    │   ├── api.js                     # Todas las llamadas a la API
    │   └── components/
    │       ├── Portal.jsx             # Portal público para participantes
    │       ├── CohortFeed.jsx         # Pantalla principal de cohorts
    │       ├── CohortDetail.jsx       # Gestión de eventos y fotos
    │       ├── UploadZip.jsx          # Subida de ZIP o fotos sueltas
    │       ├── ParticipantCard.jsx
    │       ├── AddParticipantModal.jsx
    │       ├── ImportCSVModal.jsx
    │       └── CreateCohortModal.jsx
    └── tailwind.config.js
```

---

## Ajustes de reconocimiento facial

En `backend/app/face_engine.py`:

```python
MODEL_NAME       = "ArcFace"   # Más preciso. Alternativa: "VGG-Face" (más rápido)
DETECTOR_BACKEND = "opencv"    # Más rápido. Alternativa: "retinaface" (más preciso pero lento)
THRESHOLD        = 0.50        # Más bajo = más estricto (menos falsos positivos)
```

- Si hay muchos falsos positivos → bajar threshold a `0.40`
- Si no encuentra personas que sí están → subir threshold a `0.55`

---

## LinkedIn

El sistema intenta obtener la foto de perfil de LinkedIn automáticamente.  
Para mejorar la tasa de éxito con Proxycurl, crear `backend/.env`:

```
PROXYCURL_API_KEY=tu_clave_aqui
```

Si LinkedIn falla para alguien, se puede subir la foto manualmente desde su tarjeta en el panel.

---

## Preguntas frecuentes

**¿Las fotos se envían a algún servidor externo?**  
No. Todo corre localmente. Las fotos nunca salen de tu máquina.

**¿Qué pasa si una foto tiene varias personas?**  
Se detectan todas las caras. Cada persona reconocida recibe esa foto.

**¿Puedo agregar más fotos a un evento después de procesarlo?**  
Sí — dentro del panel, selecciona el evento y usa el botón "Agregar fotos". Las nuevas fotos se indexan y quedan disponibles en el portal.

**¿Funciona con fotos tomadas desde móvil?**  
Sí. El backend normaliza la rotación EXIF automáticamente antes de procesar.
