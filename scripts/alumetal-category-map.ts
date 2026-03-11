export const ALUMETAL_BASE = "https://alumetalsa.com.ar/presupuestador";
export const DELAY_MS = 1500;

export const CATEGORY_MAP: Record<string, string> = {
  "accesorios-herramientas": "Herramientas",
  "accesorios-de-techos-y-seguridad": "Chapas, Tejas, Losas y Zinguerías",
  "accesorios-para-carpinteria-aluminio": "Carpintería de Aluminio",
  "accesorios-para-soldadura": "Herramientas",
  "aceros-trefilados-1010": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "aceros-trefilados-1045": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "adhesivos": "Cales, Cementos, Finos, Pegamentos, Pastina y Hormigones",
  "alambres": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "alambres-galvanizados": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "alambres-macisos-y-tubulares-para-soldar":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "alambres-negros-recocidos":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "angulos-de-aluminio": "Carpintería de Aluminio",
  "angulos-de-hierro": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "antioxidos-y-esmaltes": "Pintura",
  "aridos": "Agregados",
  "barras-laminadas-cuadradas":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "cables-de-acero-y-grampas-prensacables":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "cadenas": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "canos-cuadrados": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "canos-especiales-grandes-12mts":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "canos-galvanizados-con-rosca-y-cupla": "Instalaciones Sanitarias",
  "canos-negros-astm-a-53-schedule-40":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "canos-negros-biselados":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "canos-negros-con-rosca-y-cupla": "Instalaciones Sanitarias",
  "canos-negros-mecanicos":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "canos-rectangulares": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "canos-redondos": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "cementos-cales": "Cales, Cementos, Finos, Pegamentos, Pastina y Hormigones",
  "chapas-de-acero-inoxidable":
    "Chapas, Tejas, Losas y Zinguerías",
  "chapas-de-techo-cincalum-sinus-calibre-25":
    "Chapas, Tejas, Losas y Zinguerías",
  "chapas-de-techo-cincalum-sinus-calibre-27":
    "Chapas, Tejas, Losas y Zinguerías",
  "chapas-de-techo-cincalum-t101-calibre-25":
    "Chapas, Tejas, Losas y Zinguerías",
  "chapas-de-techo-cincalum-t101-calibre-27":
    "Chapas, Tejas, Losas y Zinguerías",
  "chapas-de-techo-color-t101-calibre-25":
    "Chapas, Tejas, Losas y Zinguerías",
  "chapas-decorativas": "Chapas, Tejas, Losas y Zinguerías",
  "chapas-galvanizadas-lisas": "Chapas, Tejas, Losas y Zinguerías",
  "chapas-lisas-color-calibre-25": "Chapas, Tejas, Losas y Zinguerías",
  "chapas-negras": "Chapas, Tejas, Losas y Zinguerías",
  "chapas-negras-estampadas-semilla-melon":
    "Chapas, Tejas, Losas y Zinguerías",
  "chapas-negras-perforadas": "Chapas, Tejas, Losas y Zinguerías",
  "chapas-plasticas-transparentes": "Cristalería",
  "cierre-perimetral-acmafor":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "clavos": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "construccion-en-seco-accesorios": "Construcción en Seco",
  "construccion-en-seco-cintas": "Construcción en Seco",
  "construccion-en-seco-desmontables": "Construcción en Seco",
  "construccion-en-seco-masillas": "Construcción en Seco",
  "construccion-en-seco-perfiles-drywall": "Construcción en Seco",
  "construccion-en-seco-placas-cementicias": "Construcción en Seco",
  "construccion-en-seco-placas-cielorraso": "Construcción en Seco",
  "construccion-en-seco-placas-de-yeso": "Construcción en Seco",
  "construccion-en-seco-placas-osb": "Construcción en Seco",
  "construccion-en-seco-poliestireno": "Construcción en Seco",
  "construccion-en-seco-steel-frame": "Construcción en Seco",
  "construccion-en-seco-tornillos": "Construcción en Seco",
  "construccion-en-seco-yesos-y-adhesivos": "Construcción en Seco",
  "contenedores": "Herramientas y servicio",
  "discos-para-corte-y-desbaste": "Herramientas",
  "ejes-y-llantas-agricolas": "Equipamiento",
  "electrodos": "Herramientas",
  "elementos-de-proteccion-personal-epp": "Herramientas",
  "equipos-para-pintar": "Herramientas",
  "equipos-para-soldar": "Herramientas",
  "escaleras-de-aluminio": "Herramientas",
  "estano": "Herramientas",
  "estribos-y-columnas":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "fletes": "Equipamiento",
  "ganchos-j-y-l": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "grampas": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "hidrofugos": "Aditivos, Impermeabilizaciones y Aislaciones",
  "hierro-dn-de-construccion":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "hierro-liso-redondo":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "mallas-job-shop-negras-y-galvanizadas":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "mallas-negras-para-construccion":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "mechas": "Herramientas",
  "membranas-aislantes": "Aditivos, Impermeabilizaciones y Aislaciones",
  "metales-desplegados":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "paneles-arneg": "Construcción en Seco",
  "paneles-eps": "Construcción en Seco",
  "perfiles-c": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "perfiles-de-aluminio": "Carpintería de Aluminio",
  "perfiles-ipn": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "perfiles-para-ceramico": "Suelos y Revestimientos",
  "perfiles-u-chicos-x-6mts":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "perfiles-upn": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "planchuelas-de-aluminio": "Carpintería de Aluminio",
  "planchuelas-de-hierro":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "planchuelas-de-hierro-perforadas":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "remaches-pop": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "selladores": "Aditivos, Impermeabilizaciones y Aislaciones",
  "sin-categorizar": "Herramientas",
  "te-de-aluminio": "Carpintería de Aluminio",
  "te-de-hierro": "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "tejidos-romboidales":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "tela-mosquitera-alum-natural-reforz": "Carpintería de Aluminio",
  "tornillos-autoperforantes":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "torniquetes-galvanizados":
    "Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos",
  "tubos-de-aluminio": "Carpintería de Aluminio",
  "u-de-aluminio": "Carpintería de Aluminio",
  "zorras-hidraulicas": "Herramientas",
};
