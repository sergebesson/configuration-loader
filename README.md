# configuration-loader

<!-- TOC -->

- [Description](#description)
- [Exemple d'utilisation](#exemple-dutilisation)
- [API](#api)
  - [class ConfigLoader](#class-configloader)
  - [new ConfigLoader([options])](#new-configloaderoptions)
  - [load(layers)](#loadlayers)
  - [hasLayersInError()](#haslayersinerror)
  - [getLayersInError()](#getlayersinerror)
  - [getValue(fromPath, defaultValue)](#getvaluefrompath-defaultvalue)
  - [events](#events)

<!-- /TOC -->

## Description

Permet de charger une configuration via un object JSON, un fichier, une url, une collection
[@sbesson/json-db](https://www.npmjs.com/package/@sbesson/json-db) ou de variable d'environnement.

## Exemple d'utilisation

```javascript
const ConfigLoader = require("@sbesson/configuration-loader").ConfigLoader;

configLoader = new ConfigLoader();
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
  if (configLoader.hasLayersInErrors()) {
    console.log("Le chargement de la configuration à rencontrer une erreur",
      configLoader.getLayersInError());
    throw new Error("Chargement de la configuration en erreur");
  }
  console.log("option 1", configLoader.getValue("option1"));
  console.log("option 2", configLoader.getValue("option2.cle1"));
  console.log("option other", configLoader.getValue("optionOther", "defaultValue"));
}).catch((error) {
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

### load(layers)

Charge la configuration à partir de layers.  
layers est une liste de layer.  
Chaque layer est exécuté et le résultat d'un layer sera fusionné avec le résultat du layer précédent.

__définition d'un layer__  
Un layer est un objet qui décrit comment récupérer une configuration.  
Il y a 5 types de layer possible :

* le type __object__
* le type __file__
* le type __url__
* le type __json-db__
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
  Le layer doit contenir un attribut `file` indiquant le chemin du fichier.

  ```javascript
  {
    type: "file",
    desc: "configuration via un fichier"
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
    desc: "configuration via une url"
    url: "https://www.domain.tld/configuration/config.json"
  }
  ```

* le type __json-db__  
  Ce type permet d'obtenir la configuration depuis une "base de donnée json" voir le module [@sbesson/json-db](https://www.npmjs.com/package/@sbesson/json-db).  
  Ce layer doit contenir un attribut `file` et un attribut `id` qui sera utilisé via le package
  [@sbesson/json-db](https://www.npmjs.com/package/@sbesson/json-db) pour récupérer la configuration.

  ```javascript
  {
    type: "json-db",
    desc: "configuration via une collection json-db"
    file: "/path/collection",
    id: "config"
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
  ```

retourne une promise qui sera résolu si au moins un layer a pu être utilisé et
que le jsonschema (s'il y en a un) de la configuration soit sans erreur.

en cas d'erreur, retourne un objet de type `Error` contenant deux attributs `type` et `details` en
plus du `message`.  
`type` contiendra soit `layer` (Si tous les layers sont en erreur), soit `jsonschema` en cas
* d'erreur du à jsonschema.  
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
const ConfigLoader = require("@sbesson/configuration-loader").ConfigLoader;

configLoader = new ConfigLoader();
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
    console.log("Début du chargement de la configuration du layer", layer.desc, layer.config);
  });
  ```

* `layer_load_error`: événement executé si une erreur survient lors du chargement d'une configuration par un layer, on reçoit le layer en paramètre.

  ```javascript
  configLoader.on("layer_load_error", (layer) => {
    console.log("Début du chargement de la configuration du layer", layer.desc, layer.error);
  });
  ```
