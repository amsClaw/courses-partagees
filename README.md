# Courses partagées

Une liste de courses commune à plusieurs téléphones : chacun ajoute, coche et supprime,
tout le monde voit la même liste. Produit de l'usine logicielle (`~/factory`).

## Documents

- `docs/SPEC.md` — exigences et critères observables (cadreur de l'usine)
- `docs/HISTOIRES.md` — découpage en histoires livrables

## Développement

```bash
npm install
npm test
npm start        # http://localhost:8080/health
```

Le script de test utilise `node --test`, le harnais natif de Node.js, pour éviter une dépendance de test supplémentaire.
