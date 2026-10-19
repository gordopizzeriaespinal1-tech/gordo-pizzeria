# Gordo Pizzería — Punto de venta

App de gestión: ventas (POS), inventario por receta, cierre de caja, reportes y finanzas.
Los datos se guardan en el navegador del PC (funciona sin internet) y se copian a Firebase cuando hay conexión.
Es una PWA: se instala en el PC del local desde Chrome o Edge.

## Usuarios
- `caja@gordo.com`: Ventas, Historial, Inventario y Caja (PC del local).
- `admin@gordo.com`: En vivo, Reportes, Administración y Finanzas (dueño, desde el celular).
En el login basta escribir `caja` o `admin`.

## Firebase (proyecto `gordo-pizzeria`)
1. Firestore Database en modo Producción.
2. Authentication → correo y contraseña, con los dos usuarios de arriba.
3. Firestore → Reglas: pegar el contenido de `firestore.rules` y Publicar.

## Publicar
1. Subir todos los archivos de esta carpeta al repositorio de GitHub (sin `node_modules` ni `dist`).
2. En Vercel: Add New → Project → elegir el repositorio. Framework: Vite (lo detecta solo). Deploy.
3. Cada cambio que subas a GitHub se publica solo.

## Probar en el computador (opcional)
```bash
npm install
npm run dev
```

## Primer día
- Haz el primer ingreso con internet, antes de abrir el local. Después la sesión se recuerda y funciona sin conexión.
- Instalar como app: Chrome → menú ⋮ → "Instalar Gordo Pizzería".
- El inventario trae cantidades de ejemplo (masa 40, bebidas 24 c/u) para poder vender. Ajusta al stock real en Ventas → Inventario → Ajustar.
- Nombres de socios y roles de consumo interno: Administración → Personal.
- Costos de productos y de insumos arrancan vacíos: complétalos en Administración → Productos y en Inventario.
