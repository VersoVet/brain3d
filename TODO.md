# TODO - Brain3D

## Termine (17 dec 2025)

### Couleurs des aires
- [x] Mettre la meme couleur pour toutes les aires cerebrales
  - AREA_DEFAULT_COLOR = #00d4aa (cyan/turquoise)
  - Backend (skill.py) et frontend (index.html) uniformises

### Gestion skills "off → working"
- [x] Gerer les skills qui ne tournent pas en permanence (ex: hbi-plate)
  - handleStatusUpdate gere les skills sans mesh
  - Si un skill envoie un status mais n'a pas de mesh, l'aire parente est quand meme mise a jour
  - Permet la transition off → working pour apps desktop

## Notes

- Port: 8888
- URL: http://10.0.0.11:8888
