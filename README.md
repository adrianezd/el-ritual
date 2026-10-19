# El ritual

Juego de fiesta para 4 a 10 jugadores: investigadores contra sectarios ocultos en una mansión, en diez rondas. Cada ronda todos eligen en secreto qué hacen y a qué sala van; luego se ve quién estuvo en cada sala, dónde hubo sabotaje y si apareció alguien muerto.

🔗 **Jugar ahora:** https://adrianezd.github.io/el-ritual/

## Dos modos

- **Mismo móvil:** el móvil se pasa de mano en mano para las fases secretas y hace de narrador. Funciona sin conexión.
- **Con código de sala:** uno crea la sala y elige los ajustes; el resto entra con el código y cada uno juega en su móvil. Los móviles se comunican por [ntfy.sh](https://ntfy.sh) (sin cuentas), así que hace falta internet.

## Reglas

- Investigadores: buscar pistas o vigilar (impide ataques en su sala).
- Sectarios: fingir, sabotear (ritual +1 y una pista menos) o atacar (solo con tres o más en la sala).
- Ganan los investigadores al reunir las pistas o echar a todos los sectarios; la secta, si completa el ritual, iguala en número o llega al final de la décima ronda.

## Stack técnico

Sitio estático sin dependencias ni build: HTML, CSS y JavaScript vanilla servidos por GitHub Pages.

- `script.js`: el juego. Un único motor (`act`, `privateTurn`, `render`) para los dos modos.
- `mesa.js`: modo «Mismo móvil», igual en los juegos de fiesta por fases.
- `sala.js` y `sala.css`: modo con código de sala, iguales en todos los juegos de fiesta.
- `kit.js` y `style.css`: piezas y estilos comunes. `juego.css`: lo propio de este juego.
- `sw.js`: caché para jugar sin conexión.

## Aviso

Juego de fiesta **original**, no afiliado a ninguna marca, producto o juego comercial.
