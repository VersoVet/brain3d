# Brain3D API Documentation

## Overview

Brain3D est le visualiseur 3D temps réel du système Onyx. Il agrège les données du Cerebellum via:
- **Redis** pour les événements et les statuts des skills
- **OnyxCore** pour la structure et les relations machines/skills
- **onyx-infra** pour les données d'infrastructure physique

## Endpoints

### Health & Status

#### GET /health
Health check endpoint pour le monitoring.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-04-27T12:00:00Z"
}
```

#### GET /status
Statut détaillé de brain3d (Redis, WebSocket clients, connexions).

**Response:**
```json
{
  "service": "brain3d",
  "version": "3.1.0",
  "redis": {
    "connected": true,
    "channels": ["onyx:events", "onyx:skill:status"]
  },
  "websocket": {
    "clients_connected": 5
  },
  "uptime_seconds": 3600
}
```

### Visualization Data

#### GET /api/state
État complet du réseau pour la visualisation 3D.

**Response:**
```json
{
  "nodes": [
    {
      "id": "onyx-core",
      "type": "skill",
      "label": "OnyxCore",
      "status": "online",
      "x": 100.5,
      "y": 200.3,
      "z": 50.2,
      "data": {
        "port": 8050,
        "brain_area": "cerebellum"
      }
    }
  ],
  "links": [
    {
      "source": "machine-1",
      "target": "onyx-core",
      "type": "deployed",
      "status": "active"
    }
  ],
  "timestamp": "2026-04-27T12:00:00Z"
}
```

#### GET /api/machines
Liste des machines du système.

**Response:**
```json
{
  "machines": [
    {
      "node_id": "oxya",
      "hostname": "oxya.local",
      "ip": "10.0.0.44",
      "platform": "linux",
      "status": "up",
      "last_seen": "2026-04-27T12:00:00Z",
      "skills": ["onyx-core", "brain3d", "onyx-infra"],
      "metrics": {
        "cpu_percent": 25.5,
        "memory_percent": 60.2,
        "disk_percent": 45.0
      }
    }
  ],
  "count": 1
}
```

#### GET /api/machines/{node_id}
Détail d'une machine spécifique.

**Parameters:**
- `node_id` (path): ID de la machine

**Response:**
```json
{
  "node_id": "oxya",
  "hostname": "oxya.local",
  "ip": "10.0.0.44",
  "platform": "linux",
  "status": "up",
  "last_seen": "2026-04-27T12:00:00Z",
  "skills": [
    {
      "name": "onyx-core",
      "port": 8050,
      "status": "online",
      "version": "3.0.0"
    }
  ],
  "metrics": {
    "cpu_percent": 25.5,
    "memory_percent": 60.2,
    "disk_percent": 45.0
  }
}
```

### Skills & Areas

#### GET /api/skills
Liste de tous les skills du Cerebellum.

**Response:**
```json
{
  "skills": [
    {
      "name": "onyx-core",
      "port": 8050,
      "brain_area": "cerebellum",
      "status": "online",
      "version": "3.0.0",
      "deployed_on": ["oxya"]
    },
    {
      "name": "brain3d",
      "port": 8888,
      "brain_area": "cerebellum",
      "status": "online",
      "version": "3.1.0",
      "deployed_on": ["oxya"]
    }
  ],
  "count": 15
}
```

#### GET /api/skills/{name}
Détail d'un skill spécifique.

**Parameters:**
- `name` (path): Nom du skill

**Response:**
```json
{
  "name": "onyx-core",
  "display_name": "OnyxCore",
  "version": "3.0.0",
  "port": 8050,
  "brain_area": "cerebellum",
  "status": "online",
  "description": "Centre absolu de l'aire Cerebellum",
  "deployed_on": ["oxya"],
  "endpoints": [
    {
      "method": "GET",
      "path": "/skills"
    }
  ]
}
```

#### GET /api/areas
Liste des aires cérébrales et leurs skills.

**Response:**
```json
{
  "areas": [
    {
      "area_id": "cerebellum",
      "display_name": "Cerebellum",
      "icon": "⚙️",
      "color": "#FF6B6B",
      "skills": [
        {
          "name": "onyx-core",
          "status": "online",
          "port": 8050
        },
        {
          "name": "brain3d",
          "status": "online",
          "port": 8888
        }
      ]
    }
  ]
}
```

#### GET /api/areas/{area_id}
Détail d'une aire cérébrale.

**Parameters:**
- `area_id` (path): ID de l'aire

**Response:**
```json
{
  "area_id": "cerebellum",
  "display_name": "Cerebellum",
  "description": "Orchestration et monitoring central",
  "skills": [
    {
      "name": "onyx-core",
      "status": "online"
    }
  ],
  "status_summary": {
    "online": 10,
    "offline": 0,
    "unknown": 2
  }
}
```

### Data Refresh

#### POST /api/refresh
Force le refresh de tous les données (redis, core, infra).

**Response:**
```json
{
  "status": "refreshed",
  "timestamp": "2026-04-27T12:00:00Z",
  "data_sources": {
    "redis": "ok",
    "onyx_core": "ok",
    "onyx_infra": "ok"
  }
}
```

## WebSocket

### /ws
Connexion WebSocket pour les mises à jour temps réel.

**Connection:**
```
ws://10.0.0.44:8888/ws
```

**Events reçus (du Redis):**

**skill_status_changed:**
```json
{
  "type": "skill_status_changed",
  "data": {
    "skill": "onyx-core",
    "status": "online",
    "timestamp": "2026-04-27T12:00:00Z"
  }
}
```

**machine_connected:**
```json
{
  "type": "machine_connected",
  "data": {
    "node_id": "oxya",
    "ip": "10.0.0.44",
    "timestamp": "2026-04-27T12:00:00Z"
  }
}
```

**state_updated:**
```json
{
  "type": "state_updated",
  "data": {
    "nodes_count": 15,
    "links_count": 42,
    "timestamp": "2026-04-27T12:00:00Z"
  }
}
```

## Real-time Updates via Redis

Brain3D s'abonne aux canaux Redis suivants:

- **onyx:events** — Événements système depuis OnyxCore
- **onyx:skill:status** — Statuts des skills (SDK 2.1+)
- **onyx:machines** — Enregistrement des machines

## Error Responses

### 500 Internal Server Error
```json
{
  "error": "Redis connection failed",
  "message": "Cannot reach Redis at redis://10.0.0.44:6379"
}
```

### 503 Service Unavailable
```json
{
  "error": "External service unavailable",
  "message": "OnyxCore at http://10.0.0.44:8050 not responding"
}
```

## Testing

### Health Check
```bash
curl http://10.0.0.44:8888/health
```

### Get Full State
```bash
curl http://10.0.0.44:8888/api/state | jq .
```

### WebSocket Connection (wscat)
```bash
wscat -c ws://10.0.0.44:8888/ws
```

### Force Refresh
```bash
curl -X POST http://10.0.0.44:8888/api/refresh
```
