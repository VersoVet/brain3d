# TODO - Brain3D

## Architecture Cible : Integration Core/Heart/Skills

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CORE (Cerveau)                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    Infrastructure Registry                              │ │
│  │                                                                         │ │
│  │   Machines avec Heart    Machines sans Heart    Appareils reseau       │ │
│  │   ──────────────────     ──────────────────     ────────────────       │ │
│  │   OnyxAxon               VERSO-ACCUEIL          Mikrotik               │ │
│  │   OnyxDendrite           Laptop-XYZ             Ubiquiti               │ │
│  │   VERSO-DIAG             (via Heart Proxy)      Imprimantes            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    Skills Attribution Map                               │ │
│  │                                                                         │ │
│  │  Machine           │ Skills attribues                                  │ │
│  │  ──────────────────┼──────────────────────────────────────────         │ │
│  │  OnyxSoma          │ erp-connector, ping, core-api                     │ │
│  │  OnyxAxon          │ ping, compute-heavy                               │ │
│  │  VERSO-DIAG        │ ping, dicom-viewer                                │ │
│  │  Heart Proxy       │ monitoring pour machines sans Heart               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                               Redis PubSub
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Heart Axon    │      │   Heart DIAG    │      │  Heart Proxy    │
│                 │      │                 │      │  (sur Soma)     │
│ Skills locaux   │      │ Skills locaux   │      │ Monitoring      │
│                 │      │                 │      │ machines sans   │
│                 │      │                 │      │ Heart           │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## Priorite Haute

### 1. SDK Onyx - Integration BrainClient

Le BrainClient doit etre integre directement dans le **SDK Onyx existant** (`onyx-sdk`) pour :
- Eviter de reprendre tous les skills existants
- Avoir une API unifiee pour tous les skills
- Simplifier l'import : `from onyx_sdk import OnyxClient`

- [ ] Fusionner `brain_client.py` dans `onyx-sdk`
- [ ] API unifiee :
  ```python
  from onyx_sdk import OnyxClient

  onyx = OnyxClient("mon-skill", brain_area="temporal")

  # Status (envoie vers Heart local qui forward vers Core/Brain3D)
  onyx.up("Ready")
  onyx.working("Processing...")
  onyx.error("Failed")

  # Context manager
  with onyx.task("Traitement batch"):
      do_work()
  ```
- [ ] Le SDK envoie vers OnyxHeart local (localhost:8900)
- [ ] OnyxHeart forward vers Core qui broadcast vers Brain3D
- [ ] Retrocompatibilite avec skills existants

### 2. Integration avec Infrastructure Registry de Core

- [ ] Modifier `/architecture` pour recuperer la liste des machines depuis Core (`/api/infrastructure`)
- [ ] Ajouter distinction visuelle claire entre :
  - Machines avec Heart natif (cube plein)
  - Machines via Heart Proxy (cube pointille/transparent)
  - Appareils reseau sans Heart (sphere)
- [ ] Afficher l'attribution des skills par machine
- [ ] Recevoir les events `infrastructure_update` via Redis

### 3. Support Heart Proxy

- [ ] Nouveau type de machine : `proxy_target`
- [ ] Afficher le lien entre Heart Proxy et ses machines cibles
- [ ] Status agrege : Heart Proxy montre le status de ses machines
- [ ] Animation specifique quand Heart Proxy surveille activement

### 4. Vue Deploiement Skills

- [ ] Nouvelle vue : "Skill Deployment Map"
- [ ] Visualiser quels skills sont deployes ou
- [ ] Actions possibles depuis Brain3D :
  - [ ] Demander deploiement d'un skill sur une machine
  - [ ] Demander suppression d'un skill
  - [ ] Voir historique des deploiements

### 5. Integration Network-Inventory

- [ ] Recuperer la topologie reseau depuis network-inventory
- [ ] Afficher les machines non-Heart dans le cercle exterieur
- [ ] Proposer action "Deployer Heart" sur machines compatibles
- [ ] Detecter et afficher quand un Heart remplace un Proxy

---

## Priorite Moyenne

### 6. Metriques en temps reel via Redis

- [ ] S'abonner au channel `onyx:metrics` au lieu de polling
- [ ] Afficher les 5 anneaux Torus (CPU, GPU, RAM, DISK, NET) pour chaque Heart
- [ ] Agregation des metriques pour Heart Proxy (moyenne de ses cibles)

### 7. Events Redis

- [ ] S'abonner a `onyx:events` pour tous les evenements :
  - `skill_started` / `skill_stopped`
  - `heart_connected` / `heart_disconnected`
  - `infrastructure_changed` (nouvelle machine, heart deploye, etc.)
- [ ] Animation lors des events (flash sur la machine concernee)

### 8. Actions depuis Brain3D

- [ ] Panel d'actions contextuelles au clic sur une machine
- [ ] Actions disponibles selon type :
  - Heart : voir skills, refresh, restart skill
  - Proxy target : voir status, proposer deploiement Heart
  - Network device : ping, WoL si disponible

---

## Priorite Basse

### 9. Historique et Timeline

- [ ] Vue timeline des evenements
- [ ] Historique des deploiements de skills
- [ ] Historique des changements d'infrastructure

### 10. Alertes visuelles

- [ ] Notification visuelle quand un Heart se deconnecte
- [ ] Alerte quand un skill fail
- [ ] Badge sur machines avec problemes

---

## Flux de Donnees

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FLUX STATUS (via SDK Onyx)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Skill ──► OnyxHeart local ──► OnyxCore ──► Brain3D                        │
│        (onyx-sdk)     (:8900)      (:8050)    (WebSocket)                    │
│                                                                              │
│   • Skill utilise onyx-sdk pour envoyer son status                          │
│   • OnyxHeart recoit via POST /skills/status                                │
│   • OnyxHeart forward a OnyxCore via Redis                                  │
│   • OnyxCore broadcast aux subscribers Brain3D                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Dependances

| Composant | Requis pour |
|-----------|-------------|
| SDK Onyx (avec BrainClient) | Skills envoient leur status |
| Core `/api/infrastructure` | Vue complete de l'infra |
| Core `/api/skills/attribution` | Map skills → machines |
| Redis `onyx:events` | Events temps reel |
| Network-Inventory `/devices` | Machines sans Heart |
| Heart Proxy | Monitoring machines legacy |

---

## Notes Techniques

### Nouveau format message infrastructure

```json
{
  "type": "infrastructure_update",
  "data": {
    "machines": [
      {
        "id": "OnyxAxon",
        "ip": "10.0.0.21",
        "type": "heart",
        "proxy_heart": null,
        "skills": ["ping", "compute"],
        "status": "online"
      },
      {
        "id": "VERSO-ACCUEIL",
        "ip": "10.0.0.41",
        "type": "proxy_target",
        "proxy_heart": "OnyxSoma",
        "skills": [],
        "status": "online"
      }
    ]
  }
}
```

---

## Migration depuis TODO existant

Les items suivants de l'ancien TODO restent valides :
- [x] OnyxHeart v2 deploye
- [ ] Deployer OnyxHeart v2 sur les autres machines
- [ ] Bouton Refresh global
- [ ] Metriques 1s via OnyxCore

Items modifies :
- ~~Migration des skills vers BrainClient SDK~~ → Integrer BrainClient dans SDK Onyx existant

---

*A copier dans le repo brain3d*
