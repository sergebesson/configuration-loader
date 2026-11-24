# configuration-loader

<!-- TOC -->

- [Description](#description)
- [Migrer de 1.x à 2.0.0](#migrer-de-1x-à-200)
- [Développement](#développement)
- [Exemple d'utilisation](#exemple-dutilisation)
- [API](#api)
  - [class ConfigLoader](#class-configloader)
  - [new ConfigLoader([options])](#new-configloaderoptions)
  - [config](#config)
  - [load(layers)](#loadlayers)
  - [hasLayersInError()](#haslayersinerror)
  - [getLayersInError()](#getlayersinerror)
  - [getValue(fromPath, defaultValue)](#getvaluefrompath-defaultvalue)
  - [events](#events)

<!-- /TOC -->

## Description

Permet de charger une configuration depuis un objet JSON, un fichier, une URL ou des variables d'environnement.

Prérequis : Node.js 22.20.0 ou une version plus récente.

Le paquet est en ESM et expose uniquement sa racine. L’import nommé `ConfigLoader` et `require("@sbesson/configuration-loader").ConfigLoader` renvoient la même classe. Le `require()` reste synchrone avec les réglages par défaut de Node ; le mode où `require(esm)` est désactivé n’est pas pris en charge.

## Migrer de 1.x à 2.0.0

1. **Mettre Node.js à niveau.** Passer de Node 16.4.2 minimum à Node 22.20.0 minimum, y compris en CI et en production.
2. **Importer depuis la racine du paquet.** Remplacer les accès internes comme `@sbesson/configuration-loader/ConfigLoader.js` par l’import nommé ou le `require()` de la racine montrés [ci-dessous](#exemple-dutilisation). Les autres sous-chemins, dont `@sbesson/configuration-loader/package.json`, ne sont plus exposés.
3. **Remplacer les layers `json-db`.** Charger le document dans l’application, puis passer les données de configuration à `{type: "object", config}`. Retirer le champ d’identifiant si l’application dépend de son absence : l’ancien layer le retirait automatiquement. Un descripteur de type `json-db` est désormais signalé comme type inconnu.
4. **Ne plus écrire dans `.config` ni dans les membres internes.** Modifier les données fournies aux layers, puis rappeler `load()`. `.config` renvoie une copie et n’a pas de setter. Pour les diagnostics, utiliser `hasLayersInError()` et `getLayersInError()` au lieu de lire `layers` directement.
5. **Charger le YAML via `file` ou un parseur explicite.** Le chargeur ne rend plus `require("./config.yaml")` possible par effet de bord. Les fichiers YAML restent pris en charge par le layer `file`, ainsi que les configurations JavaScript CommonJS (`.cjs` ou `.js` dans un périmètre CommonJS).

Si vous ajoutez des layers au dossier `layers/`, utilisez un export ESM par défaut pour les fabriques `.js`. Le dossier reste parcouru à chaque construction et la fabrique est appelée pour chaque instance. Placez l’initialisation par instance dans la fabrique : le code au niveau du module n’est plus réexécuté à chaque construction.

Un rechargement rejeté par le schéma laisse la dernière configuration valide accessible. Les erreurs de layer n’empêchent plus le repli sur un layer valide ; les URL malformées sont rejetées avant la première tentative et le travail HTTP s’arrête à la fin du chargement.

## Développement

- `npm test` exécute les tests avec `node:test`.
- `npm run coverage` exécute les mêmes tests et affiche le rapport de couverture de Node.js dans le terminal (lignes, branches et fonctions). Aucun rapport HTML n'est généré.
- `npm run lint` vérifie le code avec ESLint.
- `npm run knip` détecte les dépendances inutilisées ou non déclarées. Les layers chargés dynamiquement par `consign` sont déclarés comme points d'entrée dans `knip.json`.
- `npm run typecheck` vérifie les types JSDoc des sources JavaScript en mode strict, sans générer de fichiers.

À chaque construction, `consign` parcourt `layers/` et appelle les fabriques ESM avec le contexte du nouveau chargeur. Le code au niveau d’un module déjà chargé n’est pas réexécuté.

## Exemple d'utilisation

```javascript
import {ConfigLoader} from "@sbesson/configuration-loader";
```

Avec CommonJS :

```javascript
const {ConfigLoader} = require("@sbesson/configuration-loader");
```

```javascript
const configLoader = new ConfigLoader();
configLoader.load([
  {
    type: "object",
    desc: "configuration par défaut",
    config: {option1: "value1", option2: {cle1: "value2"}}
  }, {
    type: "file",
    file: "path/config.json"
  }
]).then(() => {
  if (configLoader.hasLayersInError()) {
    console.log("Le chargement de la configuration a rencontré une erreur",
      configLoader.getLayersInError());
    throw new Error("Chargement de la configuration en erreur");
  }
  console.log("option 1", configLoader.getValue("option1"));
  console.log("option 2", configLoader.getValue("option2.cle1"));
  console.log("option other", configLoader.getValue("optionOther", "defaultValue"));
}).catch((error) => {
  console.log("La configuration est incorrecte", error.message, error.details);
});
```

## API

### class ConfigLoader

La class ConfigLoader permet la gestion de chargement d'une configuration en plusieurs layers. Elle hérite de [EventEmitter](https://nodejs.org/dist/latest-v10.x/docs/api/events.html#events_class_eventemitter)

### new ConfigLoader([options])

__options__ est un objet qui peut contenir les attributs suivants :

* __jsonschema__: {jsonschema}  
  json schema de validation de la configuration.

* __httpTimeoutRequestInS__: integer  
  Timeout d'une requête http en seconde.  
  Par défaut 20s.

* __httpTimeoutInS__: integer  
  Timeout global d'une requête http et de ses re-tentatives en seconde.  
  Si ce temps est dépassé il n'y aura plus de re-tentative et l'appel sera considéré en erreur.  
  Par défaut 180s (3mn).

* __httpRetryDelayInS__: integer  
  Délai en seconde avant une nouvelle tentative.  
  Par défaut 10s.

### config

`loader.config` renvoie à chaque lecture une copie profonde de la dernière configuration valide (`{}` avant le premier chargement réussi), selon la même sémantique que `getValue()`. La propriété n’a pas de setter : une affectation directe lève une erreur `TypeError` en mode strict. Modifier les objets ordinaires ou tableaux de la copie ne modifie pas ceux du chargeur. Pour ne lire qu’une option, utiliser `getValue()`.

Le contexte `app`, les résultats bruts `layers`, le validateur `ajvValidate` et les anciennes méthodes suffixées `Private` ne sont plus accessibles. Utiliser les méthodes publiques ci-dessous pour charger la configuration et consulter les diagnostics.

### load(layers)

Charge la configuration à partir de layers.  
layers est une liste de layer.  
Chaque layer est exécuté et le résultat d'un layer sera fusionné avec le résultat du layer précédent.

__définition d'un layer__  
Un layer est un objet qui décrit comment récupérer une configuration.  
Il y a 4 types de layer possibles :

* le type __object__
* le type __file__
* le type __url__
* le type __environment__

Chaque type peut contenir un attribut __desc__ permettant d'indiquer une description du layer.  
Description des différents types :

* le type __object__  
  Dans ce type la configuration est directement dans l'attribut `config`.

  ```javascript
  {
    type: "object",
    desc: "configuration par défaut",
    config: {...}
  }
  ```

* le type __file__  
  Ce type permet d'obtenir la configuration dans un fichier json, yaml ou js (module nodejs).  
  Le layer doit contenir un attribut `file` indiquant le chemin du fichier. Un chemin relatif est résolu depuis le dossier du paquet, pas depuis le répertoire courant. Les fichiers de configuration JavaScript CommonJS restent pris en charge : utiliser `.cjs` ou un fichier `.js` dans un périmètre CommonJS.

  ```javascript
  {
    type: "file",
    desc: "configuration via un fichier",
    file: "configuration/config.json"
  }
  ```

* le type __url__  
  Ce type permet d'obtenir la configuration depuis une url.  
  Ce layer doit contenir un attribut `url` contenant l'url à appeler.  
  Si l'appel à l'url échoue ou ne répond pas au bout de `httpTimeoutRequestInS` secondes, on
  retentera toutes les `httpRetryDelayInS` secondes. Si au bout de `httpTimeoutInS` secondes la
  requête est toujours en erreur, on arrêtera et le layer sera considéré en erreur.
  Une fois chargé, le layer contiendra un champ `attempts` permettant de retrouver toutes les tentatives avec leurs échecs.

  ```javascript
  {
    type: "url",
    desc: "configuration via une url",
    url: "https://www.domain.tld/configuration/config.json"
  }
  ```

  Ce layer peut générer l'événement `layer_url_attempt_error`, qui est généré quand une tentative échoue. On reçoit en paramètre le layer et la tentative en échec

  ```javascript
  configLoader.on("layer_url_attempt_error", (layer, attempt) => {
    console.log("tentative en erreur", layer.desc, layer.url, attempt.message);
  });
  ```

* le type __environment__  
  Ce type permet d'obtenir la configuration depuis des variables d'environnement.  
  Ce layer doit contenir un attribut `mapping` qui permettra de définir quelle variable
  d'environnement doit être utilisé pour créer la configuration.  
  Si la variable d'environnement n'existe pas, la configuration correspondante ne sera pas définie.  
  Le mapping peut-être une chaîne de caractères correspondant au path de l'option à créer, ou un objet contenant deux attributs:  
  * `path` contenant le path de l'option à créer
  * `type` définissant le type de la variable. 3 types possible `string` (valeur pas défaut), `boolean` et `number`.

  Le type permettra de convertir la valeur de l'environnement qui est forcement une string dans le type défini.
  Pour le type `boolean`, les chaînes "true", "on" ou "1" permettent d'obtenir la valeur `true` toute autre chaîne donnera la valeur `false`.

  Exemple :

  ```javascript
  {
    type: "environment",
    desc: "configuration depuis des variables d'environnement",
    /* Si les variables d'environnement OPTION1, OPTION2, BOOL et NUMBER existent et contiennent VALUE1,
       20, true et 10 alors la configuration suivante sera générée :
      {option1: "VALUE1", rubrique: {option2: "20", number: 10}, bool: true}
    */
    mapping: {
      OPTION1: "option1",
      OPTION2: "rubrique.option2",
      BOOL: {type: "boolean", path: "bool"},
      NUMBER: {type: "number", path: "rubrique.number"},
    }
  }
  ```

retourne une promise qui sera résolu si au moins un layer a pu être utilisé et
que le jsonschema (s'il y en a un) de la configuration soit sans erreur.

en cas d'erreur, retourne un objet de type `Error` contenant deux attributs `type` et `details` en
plus du `message`.  
`type` contiendra soit `layer` (Si tous les layers sont en erreur), soit `jsonschema` en cas d'erreur du à jsonschema.  
`details` contiendra soit le résultat de `getLayersInError` soit les erreurs de jsonschema.

### hasLayersInError()

Permet de savoir si au moins un layer n'a pas pu être exécuté.  
Retourne `true` si au moins un layer est en erreur, Retourne `false` si aucun layer n'est en erreur.

### getLayersInError()

Permet de retourner la liste des layers en erreur. Chaque layer contiendra un attribut `error`
contenant un object de type `Error` décrivant l'erreur qui c'est produite.  
`error` contiendra au moins l'attribut `message` décrivant l'erreur.  
Exemple :

```javascript
[{
  type: "file",
  file: "path/config.json",
  error: {
    message: "Impossible de lire file_not_found.json",
    cause: "Cannot find module '../file_not_found.json'"
  }
}, {
  type: "url",
  url: "https://www.domain.tld/configuration/config.json",
  error: {
    message: "le délai de 50s a expiré",
  }
}]
```

### getValue(fromPath, defaultValue)

Permet de récupérer une option. Si cette option n'existe pas retourne `defaultValue`  
Exemple :

```javascript
import {ConfigLoader} from "@sbesson/configuration-loader";

const configLoader = new ConfigLoader();
configLoader.load([{
  type: "object",
  config: {option1: "value1", option2: {cle1: "value2"}}
}]).then(() => {
  console.log("option 1 :", configLoader.getValue("option1"));
  // Affiche : option 1 : value1
  console.log("cle1 de option 2 :", configLoader.getValue("option2.cle1"));
  // Affiche cle1 de option 2 : value2
  console.log("option other :", configLoader.getValue("optionOther", "defaultValue"));
  // Affiche option other : defaultValue
});
```

### events

Cette class peut générer les événements suivants :

* `layer_load_start`: événement executé juste avant le chargement d'une configuration par un layer, on reçoit le layer en paramètre.

  ```javascript
  configLoader.on("layer_load_start", (layer) => {
    console.log("Début du chargement de la configuration du layer", layer.desc);
  });
  ```

* `layer_load_stop`: événement executé juste après le chargement d'une configuration par un layer, on reçoit le layer en paramètre.

  ```javascript
  configLoader.on("layer_load_stop", (layer) => {
    console.log("Fin du chargement de la configuration du layer", layer.desc, layer.config);
  });
  ```

* `layer_load_error`: événement executé si une erreur survient lors du chargement d'une configuration par un layer, on reçoit le layer en paramètre.

  ```javascript
  configLoader.on("layer_load_error", (layer) => {
    console.log("Erreur lors du chargement de la configuration du layer", layer.desc, layer.error);
  });
  ```
