# Guía de categorización de materiales para LLM

Este documento define las categorías válidas y sus criterios. El LLM **DEBE** asignar SIEMPRE una categoría de esta lista. No inventar categorías nuevas.

## Formato de respuesta esperado

Para cada material, devolver:
- `categoryId`: ID numérico de la categoría (string, ej. "1")
- `unit`: una de kg, gr, mt, cm, l, ml, m2, cm2, m3, cm3, u

---

## Categorías válidas (ID | Nombre | Alcance | Ejemplos | Excluir)

### 1 | Aditivos, Impermeabilizaciones y Aislaciones
**Alcance:** Productos para impermeabilizar, aislar térmica o acústicamente, aditivos para hormigón o mortero.
**Incluye:** Lana de vidrio, espuma flex, membranas, hidrófugos, plastificantes, retardadores, fibras para hormigón.
**Ejemplos:** Lana de vidrio Isover, membrana líquida, aditivo plastificante.
**Excluir:** Pinturas (van en Pintura), cales y cementos (van en Cales/Cementos).

### 2 | Agregados
**Alcance:** Arenas, ripio, piedra, piedra partida, grava, canto rodado.
**Incluye:** Arena fina, arena gruesa, piedra granítica, ripio, tosca.
**Ejemplos:** Arena fina x m3, piedra 1:2, ripio.
**Excluir:** Tierra para relleno (van en Tierra/Tosca), cemento (va en Cales/Cementos).

### 3 | Cocina
**Alcance:** Amoblamiento de cocina, gabinetes, alacenas, bajo mesada, módulos, campanas.
**Incluye:** Melamina, muebles de cocina, cubiertas, campanas extractoras.
**Ejemplos:** Alacena de 40, bajo mesada 60, gabinete melamina.
**Excluir:** Griferías y pileta (van en Artefactos/Griferías), artefactos eléctricos (van en Equipamiento).

### 4 | Artefactos, Griferías y Accesorios Sanitarios
**Alcance:** Inodoros, bidets, lavatorios, pileta de lavar, bañeras, griferías, accesorios de baño.
**Incluye:** Depósitos, asientos, canillas, griferías de cocina/ducha/lavatorio.
**Ejemplos:** Inodoro Capea, grifería FV Allegro, pileta de lavar.
**Excluir:** Caños e instalaciones (van en Instalaciones Sanitarias), muebles bajo mesada (van en Cocina).

### 5 | Cales, Cementos, Finos, Pegamentos, Pastina y Hormigones
**Alcance:** Cemento, cal, yeso, pegamentos, adhesivos cerámicos, pastina, hormigón elaborado.
**Incluye:** Cemento portland, cal hidratada, cal viva, pegamento cerámico, enduido, hormigón H17/H21.
**Ejemplos:** Cemento Loma Negra x 25 kg, cal hidratada, pegamento Weber.
**Excluir:** Masilla para construcción en seco (van en Construcción en Seco), pintura (va en Pintura).

### 6 | Carpintería de Aluminio
**Alcance:** Puertas, ventanas y aberturas de aluminio.
**Incluye:** Ventanas de aluminio, puertas de aluminio, cerramientos.
**Ejemplos:** Ventana aluminio línea X, puerta aluminio.
**Excluir:** PVC (Carpintería PVC), madera (Carpintería Madera).

### 7 | Carpintería en Madera
**Alcance:** Puertas, ventanas y aberturas de madera.
**Incluye:** Puertas placa, marcos de madera, ventanas de madera.
**Ejemplos:** Puerta placa cedro, puerta MDF marco madera.
**Excluir:** Aluminio, PVC.

### 8 | Carpintería en PVC
**Alcance:** Puertas, ventanas y aberturas de PVC.
**Incluye:** Ventanas PVC, puertas PVC, perfiles PVC.
**Ejemplos:** Ventana línea Ecolife PVC, puerta línea Newen.
**Excluir:** Aluminio, madera.

### 9 | Carpintería Metálica
**Alcance:** Puertas y ventanas metálicas (chapa, hierro), rejas, portones metálicos.
**Incluye:** Puertas de chapa, ventanas metálicas, portones.
**Ejemplos:** Portón chapa, reja metálica.
**Excluir:** Automatización (ver si hay categoría específica o Equipamiento).

### 10 | Chapas, Tejas, Losas y Zinguerías
**Alcance:** Chapas para techo, tejas, cielorrasos de chapa, zinguería.
**Incluye:** Chapa acanalada, chapa trapezoidal, cincalum, teja francesa, cumbreras.
**Ejemplos:** Chapa acanalada galvanizada x m, teja cerámica.
**Excluir:** Chapas decorativas (pueden ir acá o en Suelos/Revestimientos según uso).

### 11 | Construcción en Seco
**Alcance:** Durlock, placas de yeso, montantes, perfiles, masillas, cintas, cielorrasos desmontables.
**Incluye:** Placa Durlock, montante, masilla Anclaflex, cinta papel, cielorraso PVC.
**Ejemplos:** Placa Durlock 12.5 mm, montante 48mm, masilla en polvo.
**Excluir:** Yeso en polvo para revoque (va en Yesería).

### 12 | Cristalería
**Alcance:** Vidrios para ventanas, espejos, vidrio templado.
**Incluye:** Vidrio simple, DVH, espejos.
**Ejemplos:** Vidrio 4 mm, DVH 4/12/4.
**Excluir:** Ventanas ya armadas (van en Carpintería correspondiente).

### 13 | Energía Renovable
**Alcance:** Paneles solares, inversores, baterías, termotanques solares.
**Incluye:** Paneles fotovoltaicos, equipos de energía solar.
**Ejemplos:** Panel solar 300W, inversor.
**Excluir:** Aires acondicionados (van en Equipamiento).

### 14 | Equipamiento
**Alcance:** Aires acondicionados, calefactores, extractores, termotanques, ventiladores, calderas.
**Incluye:** Split, calefactor, termotanque, extractor, bomba de calor.
**Ejemplos:** Split 3000 Fg, termotanque 80 litros.
**Excluir:** Herramientas manuales (van en Herramientas).

### 15 | Herramientas
**Alcance:** Herramientas para la venta. Andamios, baldes, carretillas, guantes, palas, etc.
**Incluye:** Herramientas manuales, andamios, carretillas, elementos de obra.
**Ejemplos:** Balde, pala, carretilla, guantes.
**Excluir:** Alquiler (van en Herramientas y servicio).

### 16 | Herramientas y servicio
**Alcance:** Herramientas y equipos para alquiler.
**Incluye:** Alquiler de maquinaria, andamios de alquiler.
**Ejemplos:** Alquiler mezcladora, alquiler andamio.
**Excluir:** Herramientas en venta (van en Herramientas).

### 17 | Hierros, Mallas, Alambres, Tornillos, Clavos, Cercos
**Alcance:** Hierro de construcción, mallas, alambre, tornillos, clavos, cercos, grampas.
**Incluye:** CA liso, nervado, malla SIMA, alambre galvanizado, clavos, tornillos, cercos de alambre.
**Ejemplos:** Hierro 12 mm barra 12m, malla 150x150, clavo punta Paris.
**Excluir:** Caños estructurales (pueden ir acá o revisar), perfiles para construcción en seco (van en Construcción en Seco).

### 18 | Instalaciones de Gas
**Alcance:** Caños, llaves, reguladores, flexible para gas.
**Incluye:** Caño epoxi gas, llave esférica gas, regulador, flexible.
**Ejemplos:** Caño epoxi 1/2" x 6m, regulador gas envasado.
**Excluir:** Artefactos a gas (termotanque, calefón van en Equipamiento).

### 19 | Instalaciones Eléctricas
**Alcance:** Cables, canaletas, cajas, tomas, interruptores, módulos, portalámparas.
**Incluye:** Cable, canaleta, caja embutir, toma, interruptor, plafón.
**Ejemplos:** Cable 2.5 mm, interruptor diferencial, módulo toma.
**Excluir:** Lámparas y artefactos de iluminación (pueden ir acá o en Equipamiento según criterio).

### 20 | Instalaciones Sanitarias
**Alcance:** Caños PVC, uniones, sifones, tanques, flotantes, cámara inspección.
**Incluye:** Caño PVC 110, 40, unión, sifón, tanque agua, flexibles.
**Ejemplos:** Caño PVC 110 x 4m, sifón simple, tanque 1100 lt.
**Excluir:** Griferías e inodoros (van en Artefactos/Griferías).

### 21 | Ladrillos y Bloques
**Alcance:** Ladrillos comunes, bloques de cemento, ladrillos cerámicos, huecos.
**Incluye:** Ladrillo común, bloque 20x20x40, cerámico portante, huecos.
**Ejemplos:** Ladrillo común c/u, bloque cemento, cerámico 18x18x33.
**Excluir:** Piedra y ripio (van en Agregados).

### 22 | Maderas
**Alcance:** Madera en tablas, tirantes, machimbres, tableros de madera maciza.
**Incluye:** Madera de obra, tirante, machihembrado.
**Ejemplos:** Tirante 2x4, tabla de pino.
**Excluir:** MDF, melamina, aglomerado (van en Cocina o Construcción en Seco según uso).

### 23 | Mármoles y Granito
**Alcance:** Mármol, granito, mesadas, revestimientos de piedra natural.
**Incluye:** Mesada granito, mármol travertino, cuarzo.
**Ejemplos:** Mesada granito x m2, cuarzo blanco.
**Excluir:** Cerámicos y porcelanatos (van en Suelos y Revestimientos).

### 24 | Pintura
**Alcance:** Pinturas, látex, esmaltes, impermeabilizantes líquidos para pintar.
**Incluye:** Látex, esmalte, pintura antihongos.
**Ejemplos:** Látex blanco x 20l, esmalte sintético.
**Excluir:** Hidrófugos en pasta (van en Aditivos/Impermeabilizaciones), masilla (Construcción en Seco).

### 25 | Suelos y Revestimientos
**Alcance:** Cerámicos, porcelanatos, pisos flotantes, revestimientos, alfombras.
**Incluye:** Cerámico, porcelanato, piso flotante, vinílico.
**Ejemplos:** Cerámico 45x45, piso flotante Eucafloor, porcelanato Bristol.
**Excluir:** Marmol y granito (van en Mármoles y Granito).

### 26 | Calefacción
**Alcance:** Estufas, radiadores, calefactores, sistemas de calefacción.
**Incluye:** Estufa, radiador, piso radiante.
**Ejemplos:** Estufa a leña, radiador panel.
**Excluir:** Aires acondicionados (van en Equipamiento), splits frío/calor (Equipamiento).

### 27 | Tierra, Tosca y Suelos para rellenos
**Alcance:** Tierra negra, tosca, tierra para relleno, sustrato.
**Incluye:** Tierra negra, tosca, tierra para parquizar.
**Ejemplos:** Tierra negra x m3, tosca para relleno.
**Excluir:** Arena y piedra (van en Agregados).

### 28 | Yesería
**Alcance:** Yeso para revoque, cal para revoque, productos de yesería tradicional.
**Incluye:** Yeso en polvo, revoque, enfoscado.
**Ejemplos:** Yeso de revoque x 25 kg.
**Excluir:** Placas Durlock y construcción en seco (van en Construcción en Seco), masillas (Construcción en Seco).

---

## Unidades válidas

- **kg** – Kilogramos (cemento x 25 kg, alambre x kg)
- **gr** – Gramos
- **mt** – Metros lineales (chapas x m, caños x m)
- **cm** – Centímetros
- **l** – Litros (pintura, silicona)
- **ml** – Mililitros
- **m2** – Metro cuadrado (cerámicos, chapas decorativas, lana de vidrio x m2)
- **cm2** – Centímetro cuadrado
- **m3** – Metro cúbico (arena, piedra, hormigón)
- **cm3** – Centímetro cúbico
- **u** – Unidad (ladrillos c/u, artefactos, aberturas, gabinetes)

**Regla para "x 25 kg" o "x 40 kg":** Si es un bulto/bolsa que se vende completo → **u**. Si se vende por peso → **kg**.

---

## Ejemplos reales (referencia para categorizar)

Puerta placa cedro → 7, u | Lana vidrio Isover x m2 → 1, m2 | Split Fg → 14, u | Acelerante fragüe, Membrana, Plavicon, QUIMTEX → 1, u | Pintura asfáltica, Látex, Antioóxido → 24, l | Arena bolsa → 2, u | Arena x m3 → 2, m3 | Montante, Placa Durlock, Solera, Acustic, Buña, Cubrecanto → 11, mt o m2 | Tornillos x 100u, Galvanizado x kg → 17, u o kg | Caja, Campanilla, Caño hierro, Jabalina, Led, Anclaje, Cartela, Conector, Tapa Jeluz → 19 | Unión PVC paracaño → 19 o 20 | Puerta/Cabina ascensor → 4, u | Cal, Cemento x kg → 5, kg | Chapa acanalada x m → 10, mt | Biodigestor, Porcelanato, Piso vinílico, Cerámico → 25, m2 | Brimax, Adoquín, Cerámicos Rosario, Sphan → 21, u | Fenólico, Puntal, Tabla encofrado → 22, mt | Amoladora, Sierra, Taladro → 15, u | Calefactor Sombrilla gas → 26, l | Nicho chapa → 4, u | Hidrófugo → 1, u | Cielorrasos x lt → 24, l

---

## Reglas de desempate

1. Si un material encaja en dos categorías, elegir la **más específica** (ej. Carpintería PVC antes que Carpintería en general).
2. Si hay duda entre Construcción en Seco y Yesería: placas y perfiles → Construcción en Seco; yeso en polvo para revoque → Yesería.
3. Si hay duda entre Equipamiento y Instalaciones: artefactos (split, termotanque, calefactor) → Equipamiento o Calefacción; caños, cajas, tomas → Instalaciones Eléctricas/Sanitarias.
4. Caños/uniones para electricidad (paracaño, bajada) → 19. Caños para agua → 20. Cielorrasos, látex, pintura asfáltica → 24 Pintura.
5. Ejemplos clave: Lana vidrio x m2→1 Aditivos m2. Split→14 u. Pintura asfáltica→24 l. Arena→2 u o m3. Placa Durlock→11 mt. Tornillos, galvanizado→17 u/kg. Caja, campanilla, caño hierro, Led→19. Adoquín, cerámicos muro→21 u. Porcelanato→25 m2. Sierra, amoladora→15 u. Calefactor sombrilla→26 l. Hidrófugo→1 u.
