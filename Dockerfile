# Stage 1: build the React frontend
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Vite bakes VITE_* into the bundle at build time. .env is git-ignored, so the
# Google client ID must be injected here as a build arg (Vite's loadEnv reads
# prefixed vars from the process env). Without it the sign-in button can't init.
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ARG VITE_HOME_URL
ENV VITE_HOME_URL=$VITE_HOME_URL
RUN npm run build

# Stage 2: Python backend serving the API + built frontend
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /fe/dist ./static

ENV OLIVE_DB=/data/olive.db
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
