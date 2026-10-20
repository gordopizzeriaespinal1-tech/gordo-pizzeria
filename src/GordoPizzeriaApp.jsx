import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ShoppingCart, Package, Wallet, BarChart3, Plus, Minus, Trash2,
  X, Check, AlertTriangle, TrendingUp, TrendingDown, ChevronRight,
  Pizza, DollarSign, Clock, RotateCcw, Settings, ArrowLeft, Loader2,
  CircleDollarSign, ReceiptText, Boxes, ChefHat, MessageSquare, Phone,
  Cloud, CloudOff, RefreshCw, Upload, Download, Tags, Users, Menu, LogOut
} from "lucide-react";
import { createPortal } from "react-dom";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, collection, query, where, orderBy, limit, addDoc, updateDoc, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

/* ============================================================
   CONFIGURACIÓN DE FIREBASE
   ------------------------------------------------------------
   Reemplaza estos valores por los de TU proyecto de Firebase.
   Los encuentras en: Firebase Console → Ícono de engranaje →
   Configuración del proyecto → Tus apps → App web (</>) → SDK config.
   Instrucciones completas en el README.md del proyecto.
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyClQZTmVk5OXhF_ibCyJ_zv82alz8XjHic",
  authDomain: "gordo-pizzeria.firebaseapp.com",
  projectId: "gordo-pizzeria",
  storageBucket: "gordo-pizzeria.firebasestorage.app",
  messagingSenderId: "723246613638",
  appId: "1:723246613638:web:e2e00026206ca9dee5bd07",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
// Todo el negocio comparte un mismo espacio de datos en la nube (un solo local).
const DOC_COLLECTION = "gordo-pizzeria";
// Las ventas y los cierres se guardan FRAGMENTADOS para que un documento nunca pase del límite
// de 1 MB de Firestore: un documento por DÍA en ventas_dia y un documento por MES en cierres_mes.
// En el PC (LocalStorage) se guardan igual que siempre: un solo array de ventas y uno de cierres,
// porque el PC es la fuente de verdad y es más simple trabajar con el array completo en memoria.
const VENTAS_COLLECTION = "ventas_dia";
const CIERRES_COLLECTION = "cierres_mes";

// Helpers de agrupación por fecha (YYYY-MM-DD) y mes (YYYY-MM).
function agruparPorFecha(ventas) {
  const m = new Map();
  for (const v of ventas || []) {
    const f = v.fecha || "sin-fecha";
    if (!m.has(f)) m.set(f, []);
    m.get(f).push(v);
  }
  return m;
}
function agruparPorMes(cierres) {
  const m = new Map();
  for (const c of cierres || []) {
    const mes = (c.fecha || "sin-fecha").slice(0, 7);
    if (!m.has(mes)) m.set(mes, []);
    m.get(mes).push(c);
  }
  return m;
}

// Usuarios de la app (se crean en Firebase Console → Authentication → Users).
const EMAIL_CAJA = "caja@gordo.com";
const EMAIL_ADMIN = "admin@gordo.com";
// Categorías de venta (editables por el admin). Los productos guardan el id en su campo "color".
const CATEGORIAS_INICIALES = [
  { id: "clasicas", nombre: "Clásicas", icono: "🍕" },
  { id: "tradicionales", nombre: "Tradicionales", icono: "🍕" },
  { id: "especiales", nombre: "Especiales", icono: "🍕" },
  { id: "bebida", nombre: "Bebidas", icono: "🥤" },
];
// Categoría por defecto para un producto nuevo.
const CATEGORIA_POR_DEFECTO = "especiales";
// Bloques que la caja NO sincroniza ni ve (solo el admin): finanzas y pedidos de insumos.
const SOLO_ADMIN_KEYS = ["personal", "movs_financieros", "pedidos_insumos"];

// Módulo de Finanzas: OCULTO TEMPORALMENTE mientras se reestructura.
// Solo se esconde en pantalla: el código y TODOS los datos (movimientos, pedidos, personal) se
// conservan, se siguen sincronizando y entran en el respaldo. Para volver a mostrarlo, cambiar a true.
const MODULO_FINANZAS_ACTIVO = false;
const rolDeEmail = (email) => {
  const e = (email || "").toLowerCase();
  if (e === EMAIL_ADMIN) return "admin";
  if (e === EMAIL_CAJA) return "caja";
  return null;
};

/* ============================================================
   GORDO PIZZERÍA — Sistema de gestión de negocio
   POS + Inventario por receta + Cierre de caja + Reportes
   ============================================================ */

// ---------- Datos base del menú (carta real de Gordo Pizzería) ----------
const MENU_INICIAL = [
  {
    id: "margarita",
    nombre: "Margarita",
    precio: 20000,
    desc: "Salsa de tomates san marzano italianos, albahaca orgánica y mozzarella fresca 100% de búfala",
    color: "clasicas",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "pesto",
    nombre: "Pesto",
    precio: 20000,
    desc: "Pesto de albahaca artesanal, tomates cherry confitados en aceite de oliva y mozzarella fresca 100% de búfala",
    color: "clasicas",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "quesillo_arequipe",
    nombre: "Quesillo con arequipe",
    precio: 20000,
    desc: "El casado por tradición: quesillo de hoja y arequipe",
    color: "clasicas",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "pepperoni",
    nombre: "Pepperoni",
    precio: 25000,
    desc: "Salsa de tomates san marzano, mozzarella de búfala, pepperoni madurado y miel de abejas orgánica con un toque de pimienta roja",
    color: "tradicionales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "salchicha_alemana",
    nombre: "Salchicha Alemana",
    precio: 25000,
    desc: "Salsa de tomates san marzano, albahaca orgánica, mozzarella de búfala y salchicha alemana",
    color: "tradicionales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "salami",
    nombre: "Salami",
    precio: 25000,
    desc: "Salsa de tomates san marzano, mozzarella de búfala, salami madurado y cebolla morada",
    color: "tradicionales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "chorizo_argentino",
    nombre: "Chorizo Argentino",
    precio: 25000,
    desc: "Salsa de tomates san marzano, mozzarella de búfala, chorizo artesanal y maíz tierno dulce",
    color: "tradicionales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "pollo_champinones",
    nombre: "Pollo y Champiñones",
    precio: 30000,
    desc: "Salsa de tomates san marzano, mozzarella de búfala, pechuga con finas hierbas parrillada y champiñones frescos",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "hawaianisima",
    nombre: "Hawaianísima",
    precio: 30000,
    desc: "Salsa de tomates san marzano, mozzarella de búfala, láminas de lomo de cerdo al barril y piña caramelizada en panela",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "panceta",
    nombre: "Panceta",
    precio: 30000,
    desc: "Salsa de tomates san marzano, stracciatella, panceta horneada y cebolla crispí",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "cuatro_quesos",
    nombre: "Cuatro Quesos",
    precio: 30000,
    desc: "Queso azul, queso parmesano, mozzarella fresca 100% de búfala, provolone ahumado y miel de romero",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "pulled_pork",
    nombre: "Pulled pork",
    precio: 30000,
    desc: "Salsa de tomates san marzano, mozzarella de búfala, cerdo horneado 24 hrs, rúgula fresca orgánica y miel de abejas con romero fresco",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "birria",
    nombre: "Birria",
    precio: 30000,
    desc: "Salsa de birria casera, mozzarella de búfala, pecho de res en sus jugos picosos, pico de gallo con cilantro y crema de aguacate",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "roastbeef",
    nombre: "Roastbeef",
    precio: 30000,
    desc: "Salsa de tomates san marzano, mozzarella de búfala, láminas de lomo ancho horneado, cebolla roja en julianas y chimichurri casero",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "albondiga",
    nombre: "Albóndiga",
    precio: 30000,
    desc: "Salsa de tomates san marzano, mozzarella de búfala, albóndigas jugosas de res y julianas de cebolla morada y pimentón",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "anillos_calamar",
    nombre: "Anillos de calamar",
    precio: 30000,
    desc: "Pesto de albahaca artesanal, tomates cherry confitados, mozzarella de búfala, anillos de calamar y rúgula",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "bolognesa",
    nombre: "Bolognesa",
    precio: 30000,
    desc: "Salsa bolognesa con tomate san marzano y carne molida artesanal, mozzarella de búfala, orégano y queso parmesano",
    color: "especiales",
    recipe: [{ insumoId: "masa_pizza", cant: 1 }],
  },
  {
    id: "coca_cola",
    nombre: "Coca Cola",
    precio: 4000,
    desc: "Gaseosa",
    color: "bebida",
    recipe: [{ insumoId: "coca_cola", cant: 1 }],
  },
  {
    id: "hatsu",
    nombre: "Hatsu",
    precio: 4000,
    desc: "Té Hatsu",
    color: "bebida",
    recipe: [{ insumoId: "hatsu", cant: 1 }],
  },
  {
    id: "soda",
    nombre: "Soda",
    precio: 4000,
    desc: "Soda",
    color: "bebida",
    recipe: [{ insumoId: "soda", cant: 1 }],
  },
];

// ---------- Destinatarios de consumo interno (socios y roles del local) ----------
// Socios: no cobran jornal; su consumo se muestra aparte en Finanzas → Pago a personal.
// Edita estos nombres aquí o desde Administración → Personal.
const SOCIOS = ["Socio 1", "Socio 2", "Socio 3"];
const CONSUMO_INTERNO_INICIAL = [...SOCIOS, "Cajero", "Pizzero"];

// Tipos de entrega — se muestran en grande en la comanda de cocina
const TIPOS_ENTREGA = ["domicilio", "recogen", "mesa"];
const LABEL_ENTREGA = {
  domicilio: "DOMICILIO",
  recogen: "RECOGEN",
  mesa: "PARA LA MESA",
};

// ---------- Inventario inicial (masa de pizza y bebidas) ----------
// OJO: las cantidades son de ejemplo para poder empezar a vender. Ajústalas al stock real
// desde Ventas → Inventario → Ajustar (queda en la bitácora). Los costos arrancan en $0.
const INSUMOS_INICIALES = [
  { id: "masa_pizza", nombre: "Masa de pizza", unidad: "unid", stock: 40, minimo: 10, costoUnit: 0 },
  { id: "coca_cola", nombre: "Coca Cola", unidad: "unid", stock: 24, minimo: 6, costoUnit: 0 },
  { id: "hatsu", nombre: "Hatsu", unidad: "unid", stock: 24, minimo: 6, costoUnit: 0 },
  { id: "soda", nombre: "Soda", unidad: "unid", stock: 24, minimo: 6, costoUnit: 0 },
];

const CLP = (n) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0);

// Fecha local (NO usar toISOString() para esto: usa UTC y desfasa el día según la zona horaria,
// haciendo que ventas de la noche aparezcan fechadas al día siguiente).
const localDateStr = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const todayStr = () => localDateStr(new Date());
const nowTime = () => new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fullDateTime = (ts) => new Date(ts).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });

// Devuelve el lunes de la semana a la que pertenece una fecha (semana Lunes a Domingo)
const inicioSemana = (d = new Date()) => {
  const fecha = new Date(d);
  fecha.setHours(0, 0, 0, 0);
  const diaSemana = fecha.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
  const restar = diaSemana === 0 ? 6 : diaSemana - 1; // cuántos días retroceder hasta el lunes
  fecha.setDate(fecha.getDate() - restar);
  return fecha;
};
// Clave única de la semana (usa la fecha del lunes)
const claveSemana = (d = new Date()) => localDateStr(inicioSemana(d));
// Etiqueta legible del rango de la semana
const etiquetaSemana = (lunesStr) => {
  const lunes = new Date(lunesStr + "T12:00:00");
  const domingo = new Date(lunes);
  domingo.setDate(domingo.getDate() + 6);
  const fmt = (x) => x.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  return `${fmt(lunes)} — ${fmt(domingo)}`;
};
// Clave del mes (YYYY-MM)
const claveMes = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ---------- Utilidades de método de pago (soporta pago dividido entre efectivo/transferencia) ----------
// Devuelve cuánto de una venta corresponde a un método de pago específico (para sumar en caja/reportes).
function montoPorMetodo(venta, metodo) {
  if (venta.metodoPago === metodo) return venta.total;
  if (venta.metodoPago === "mixto") {
    const p = (venta.pagosMixtos || []).find((x) => x.metodo === metodo);
    return p ? p.monto : 0;
  }
  return 0;
}

// ---------- Costo de productos ----------
// Costo de UN producto del menú. Prioriza el costo directo que ingresa el dueño (costoUnit del producto).
// Si ese producto no tiene costo directo definido, cae de respaldo a la suma de insumos de su receta.
function costoDeProducto(menuItem, insumos) {
  if (!menuItem) return 0;
  if (menuItem.costoUnit != null && menuItem.costoUnit !== "") return Number(menuItem.costoUnit) || 0;
  // Respaldo: sumar insumos de la receta (para productos que aún no tienen costo directo)
  let costo = 0;
  for (const r of menuItem.recipe || []) {
    const ins = insumos.find((i) => i.id === r.insumoId);
    if (ins) costo += (ins.costoUnit || 0) * r.cant;
  }
  return costo;
}

// Costo total de los items de una venta (cantidad × costo unitario de cada producto).
function costoDeVenta(items, menu, insumos) {
  let costo = 0;
  for (const it of items) {
    const mi = menu.find((m) => m.id === it.itemId);
    costo += costoDeProducto(mi, insumos) * it.cant;
  }
  return costo;
}

// Fecha efectiva en que el dinero de una venta realmente entró: cuando se cobró (pagadoEn),
// o su fecha de creación si nunca fue una cuenta pendiente (pagadoEn = ts en ese caso).
// Úsese SIEMPRE que se agrupe dinero por período (semana/mes/día) — así una cuenta pendiente
// creada una semana y cobrada en otra cuenta como ingreso de la semana en que realmente se pagó,
// no de la semana en que se creó. Ventas antiguas sin el campo caen de respaldo a su ts.
function fechaPagoDe(v) {
  return v.pagadoEn || v.ts;
}


// Texto legible del método de pago, incluyendo el desglose si fue dividido.
function labelMetodoPago(venta) {
  if (venta.metodoPago === "mixto") {
    return (venta.pagosMixtos || [])
      .map((p) => `${p.metodo === "efectivo" ? "Efvo" : "Transf"} ${CLP(p.monto)}`)
      .join(" + ");
  }
  if (venta.metodoPago === "pendiente") return "Pendiente";
  if (venta.metodoPago === "interno") return "Consumo interno";
  if (venta.metodoPago === "tarjeta") return "Tarjeta";
  if (venta.metodoPago === "transferencia") return "Transferencia";
  return "Efectivo";
}

// ---------- Exportación CSV ----------
function escapeCsv(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarCierreCSV(cierre) {
  const movsTurno = cierre.movsTurno || [];
  const rows = [
    ["GORDO PIZZERÍA — REPORTE DE CIERRE DE CAJA"],
    [],
    ["Fecha", cierre.fecha],
    ["Apertura", fullDateTime(cierre.abiertaTs)],
    ["Cierre", fullDateTime(cierre.cerradaTs)],
    [],
    ["Efectivo inicial", cierre.efectivoInicial],
    ["Ventas en efectivo", cierre.ventasEfectivo],
    ["Ventas con tarjeta", cierre.ventasTarjeta],
    ["Ventas por transferencia", cierre.ventasTransfer],
    ["Total ventas (clientes)", cierre.ventasTotal],
    ["N° de ventas", cierre.numVentas],
    [],
    ["Consumo interno (valor referencia)", cierre.totalInterno || 0],
    ["N° de consumos internos", cierre.numInterno || 0],
    [],
    ["Ingresos manuales", cierre.ingresosManual],
    ["Retiros manuales", cierre.retirosManual],
    [],
    ["Efectivo esperado", cierre.efectivoEsperado],
    ["Efectivo contado", cierre.efectivoContado],
    ["Diferencia", cierre.diferencia],
  ];
  if (movsTurno.length > 0) {
    rows.push([]);
    rows.push(["MOVIMIENTOS MANUALES DEL TURNO"]);
    rows.push(["Hora", "Tipo", "Monto", "Motivo"]);
    for (const m of movsTurno) {
      rows.push([fullDateTime(m.ts), m.tipo === "ingreso" ? "Ingreso" : "Retiro", m.monto, m.motivo]);
    }
  }
  downloadCSV(`gordo-pizzeria_cierre-caja_${cierre.fecha}.csv`, rows);
}

function exportarVentasCSV(cierre) {
  const ventasTurno = cierre.ventasTurno || [];
  const rows = [
    ["GORDO PIZZERÍA — REPORTE DE VENTAS DEL TURNO"],
    ["Fecha", cierre.fecha],
    [],
    ["N° pedido", "Hora", "Cliente / Tipo", "Productos", "Cant. total", "Total", "Método de pago", "Estado"],
  ];
  for (const v of ventasTurno) {
    const clienteOTipo = v.tipoVenta === "interno" ? `Consumo interno — ${v.socioInterno}` : (v.nombreCliente || "Sin nombre");
    const productos = v.items.map((it) => `${it.cant}x ${it.nombre}`).join("; ");
    const cantTotal = v.items.reduce((s, it) => s + it.cant, 0);
    const estado = v.anulada ? "ANULADA" : v.metodoPago === "pendiente" ? "PENDIENTE" : v.editada ? "Editada" : "OK";
    rows.push([v.numeroPedido ?? "", v.hora, clienteOTipo, productos, cantTotal, v.total, labelMetodoPago(v), estado]);
  }
  const totalNeto = ventasTurno.filter((v) => !v.anulada && v.tipoVenta !== "interno" && v.metodoPago !== "pendiente").reduce((s, v) => s + v.total, 0);
  const totalPendienteTurno = ventasTurno.filter((v) => !v.anulada && v.metodoPago === "pendiente").reduce((s, v) => s + v.total, 0);
  rows.push([]);
  rows.push(["Total neto del turno (sin anuladas, consumo interno ni pendientes)", "", "", "", "", totalNeto]);
  if (totalPendienteTurno > 0) {
    rows.push(["Cuentas nuevas quedaron pendientes por cobrar", "", "", "", "", totalPendienteTurno]);
  }
  downloadCSV(`gordo-pizzeria_ventas_${cierre.fecha}.csv`, rows);
}


// ---------- Persistencia HÍBRIDA: LocalStorage primero + Firebase como espejo en la nube ----------
// Principio: LocalStorage es la fuente de verdad y guarda instantáneamente (no depende de internet).
// Firebase se actualiza en segundo plano cuando hay conexión — sirve para verlo desde el celular.
// Nunca leemos de Firebase para llenar la app: eso previene que datos viejos sobrescriban los del día.
// ---------- Detección de pantalla móvil (la app es táctil de escritorio, pero se consulta desde el celular) ----------
function useIsMobile(breakpoint = 820) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

const LS_PREFIX = "gordopizzeria_";
const LS_QUEUE_KEY = LS_PREFIX + "sync_queue"; // cola de cambios pendientes por subir a Firebase

// ¿Hay un usuario de verdad con sesión iniciada? (sin esto Firebase rechaza todo con "permission-denied")
function sesionActiva() {
  return !!auth.currentUser && !auth.currentUser.isAnonymous;
}
// ¿El error de Firebase es de conexión (internet caído / servidor inalcanzable)? Si es así, no tiene
// sentido seguir intentando con los demás bloques: todos van a fallar igual. Cualquier otro error
// (permisos, documento demasiado grande, datos inválidos) afecta SOLO a ese bloque.
function esErrorDeRed(e) {
  const code = e && e.code ? String(e.code) : "";
  if (["unavailable", "deadline-exceeded", "cancelled", "auth/network-request-failed", "unauthenticated"].includes(code)) return true;
  return /network|offline|failed to fetch|timeout/i.test(String((e && e.message) || ""));
}
// Nombre legible de un bloque de la cola, para mensajes al usuario
function nombreBloque(key) {
  if (key.startsWith("vd:")) return `ventas del ${key.slice(3)}`;
  if (key.startsWith("cm:")) return `cierres de ${key.slice(3)}`;
  const nombres = { insumos: "inventario", caja_actual: "caja", movimientos_caja: "movimientos de caja", movs_inventario: "bitácora de inventario", menu: "menú", consumo_interno: "consumo interno", config: "configuración" };
  return nombres[key] || key;
}

const lsGet = (key, fallback) => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const lsSet = (key, value) => {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("Error guardando en LocalStorage", key, e);
    return false;
  }
};

function useStorage(rol, email) {
  // El modo ahora lo define el usuario que inició sesión:
  //  - usuario "caja": registra ventas. LocalStorage manda; sube a Firebase en segundo plano.
  //  - usuario "admin": mira en vivo lo que pasa en la caja (lee de Firebase) y edita gestión.
  const modo = rol === "admin" ? "consulta" : "caja";
  const [ready, setReady] = useState(false);
  const [insumos, setInsumos] = useState(INSUMOS_INICIALES);
  const [menu, setMenu] = useState(MENU_INICIAL);
  const [consumoInterno, setConsumoInterno] = useState(CONSUMO_INTERNO_INICIAL);
  const [movsInventario, setMovsInventario] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [cajaAbierta, setCajaAbierta] = useState(null);
  const [movimientosCaja, setMovimientosCaja] = useState([]);
  const [config, setConfig] = useState({}); // PIN de admin y otras configuraciones
  const [personal, setPersonal] = useState([]); // trabajadores: nombre, rol, pago
  const [movsFinancieros, setMovsFinancieros] = useState([]); // facturas, pagos, gastos
  const [categorias, setCategorias] = useState(CATEGORIAS_INICIALES);
  const [pedidosInsumos, setPedidosInsumos] = useState([]); // pedidos a proveedores (solo admin)
  const [comandos, setComandos] = useState([]); // órdenes del admin hacia la caja (solo admin las ve)
  const [storageError, setStorageError] = useState(null);
  const [syncStatus, setSyncStatus] = useState({ pending: 0, lastSync: null, online: navigator.onLine, authed: false });

  // "Cambiar de modo" ahora es cerrar sesión (los datos locales NO se tocan).
  const setModo = useCallback(() => { signOut(auth).catch(() => {}); }, []);

  const esConsulta = modo === "consulta";

  // 1. Cargar desde LocalStorage al arrancar (solo en modo caja — nunca desde Firebase, para no sobrescribir el día)
  useEffect(() => {
    if (modo !== "caja") return;
    try {
      setInsumos(lsGet("insumos", INSUMOS_INICIALES));
      setMenu(lsGet("menu", MENU_INICIAL));
      setConsumoInterno(lsGet("consumo_interno", CONSUMO_INTERNO_INICIAL));
      setMovsInventario(lsGet("movs_inventario", []));
      setVentas(lsGet("ventas", []));
      setCierres(lsGet("cierres", []));
      setCajaAbierta(lsGet("caja_actual", null));
      setMovimientosCaja(lsGet("movimientos_caja", []));
      setConfig(lsGet("config", {}));
      setCategorias(lsGet("categorias", CATEGORIAS_INICIALES));
      const q = lsGet("sync_queue", {});
      setSyncStatus((s) => ({ ...s, pending: Object.keys(q).length }));
    } catch (e) {
      console.error("Error cargando LocalStorage", e);
      setStorageError("No se pudo leer el almacenamiento local del navegador.");
    } finally {
      setReady(true);
    }
  }, [modo]);

  // 1-bis. Modo consulta: escuchar Firebase en vivo (solo lectura, nunca escribe)
  useEffect(() => {
    if (modo !== "consulta" || !syncStatus.authed) return;
    let restantes = 13;
    const marcarCargado = () => {
      restantes -= 1;
      if (restantes <= 0) setReady(true);
    };
    const escuchar = (key, setter, fallback) =>
      onSnapshot(
        doc(db, DOC_COLLECTION, key),
        (snap) => {
          setter(snap.exists() ? snap.data().value : fallback);
          setStorageError(null);
          marcarCargado();
        },
        (e) => {
          console.error("Error escuchando Firebase", key, e);
          setStorageError("No se pudo conectar para ver los datos en vivo. Revisa tu conexión a internet.");
          marcarCargado();
        }
      );
    // Ventas y cierres viven en colecciones aparte (fragmentadas por día/mes).
    // Juntamos todos los documentos en un array plano para que la UI los vea igual que siempre.
    const ventasMap = new Map();
    let ventasListo = false;
    const unsubVentas = onSnapshot(
      collection(db, VENTAS_COLLECTION),
      (snap) => {
        snap.docChanges().forEach((ch) => {
          const fecha = ch.doc.id;
          if (ch.type === "removed") ventasMap.delete(fecha);
          else ventasMap.set(fecha, ch.doc.data().ventas || []);
        });
        const todas = [];
        for (const arr of ventasMap.values()) todas.push(...arr);
        todas.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        setVentas(todas);
        setStorageError(null);
        if (!ventasListo) { ventasListo = true; marcarCargado(); }
      },
      (e) => {
        console.error("Error escuchando ventas_dia", e);
        setStorageError("No se pudo conectar para ver los datos en vivo. Revisa tu conexión a internet.");
        if (!ventasListo) { ventasListo = true; marcarCargado(); }
      }
    );
    const cierresMap = new Map();
    let cierresListo = false;
    const unsubCierres = onSnapshot(
      collection(db, CIERRES_COLLECTION),
      (snap) => {
        snap.docChanges().forEach((ch) => {
          const mes = ch.doc.id;
          if (ch.type === "removed") cierresMap.delete(mes);
          else cierresMap.set(mes, ch.doc.data().cierres || []);
        });
        const todos = [];
        for (const arr of cierresMap.values()) todos.push(...arr);
        todos.sort((a, b) => (a.abiertaTs || 0) - (b.abiertaTs || 0));
        setCierres(todos);
        if (!cierresListo) { cierresListo = true; marcarCargado(); }
      },
      (e) => {
        console.error("Error escuchando cierres_mes", e);
        if (!cierresListo) { cierresListo = true; marcarCargado(); }
      }
    );
    const unsubs = [
      escuchar("insumos", setInsumos, INSUMOS_INICIALES),
      escuchar("menu", setMenu, MENU_INICIAL),
      escuchar("consumo_interno", setConsumoInterno, CONSUMO_INTERNO_INICIAL),
      escuchar("movs_inventario", setMovsInventario, []),
      unsubVentas,
      unsubCierres,
      escuchar("caja_actual", setCajaAbierta, null),
      escuchar("movimientos_caja", setMovimientosCaja, []),
      escuchar("config", setConfig, {}),
      escuchar("personal", setPersonal, []),
      escuchar("movs_financieros", setMovsFinancieros, []),
      escuchar("categorias", setCategorias, CATEGORIAS_INICIALES),
      escuchar("pedidos_insumos", setPedidosInsumos, []),
    ];
    return () => unsubs.forEach((u) => u());
  }, [modo, syncStatus.authed]);

  // 1-bis-b. Admin: ver en vivo las órdenes enviadas a la caja y su estado
  useEffect(() => {
    if (modo !== "consulta" || !syncStatus.authed) return;
    const q = query(collection(db, "comandos"), orderBy("ts", "desc"), limit(200));
    return onSnapshot(
      q,
      (snap) => setComandos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.warn("No se pudieron leer las órdenes al PC", e)
    );
  }, [modo, syncStatus.authed]);

  // 1-ter. Modo caja: escuchar SOLO los bloques de gestión desde Firebase.
  // Esto permite que lo que el dueño edita desde el celular (productos, personal, consumo interno,
  // config) llegue al PC de la caja en vivo. NO se escuchan ventas/caja/inventario: de esos, el PC
  // es la fuente de verdad y no debe dejar que nadie los pise.
  useEffect(() => {
    if (modo !== "caja" || !syncStatus.authed || !ready) return;
    // Estos bloques solo los edita el admin: la nube manda. Se aplica el valor de la nube (también el
    // primero al conectar, para no perder cambios hechos con el PC apagado) salvo que este PC tenga un
    // cambio propio todavía por subir.
    const escucharGestion = (key, setter) =>
      onSnapshot(
        doc(db, DOC_COLLECTION, key),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return; // cambio propio en vuelo, no rebote
          if (lsGet("sync_queue", {})[key]) return; // hay un cambio local sin subir: manda el local
          if (snap.exists()) {
            const val = snap.data().value;
            const actual = lsGet(key, null);
            if (JSON.stringify(actual) === JSON.stringify(val)) return;
            setter(val);
            lsSet(key, val); // reflejar en LocalStorage para que persista tras recargar
          }
        },
        (e) => {
          console.warn("No se pudo escuchar cambios de gestión", key, e);
          setStorageError("No se reciben los cambios del admin (revisa internet o las reglas de Firebase).");
        }
      );
    const unsubs = [
      escucharGestion("menu", setMenu),
      escucharGestion("consumo_interno", setConsumoInterno),
      escucharGestion("config", setConfig),
      escucharGestion("categorias", setCategorias),
    ];
    return () => unsubs.forEach((u) => u());
  }, [modo, syncStatus.authed, ready]);

  // 2. Autenticación anónima con Firebase (best-effort — si falla, la app sigue funcionando offline)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setSyncStatus((s) => ({ ...s, authed: !!user && !user.isAnonymous }));
    });
    return unsub;
  }, []);

  // 3. Detectar cambios de conexión para saber cuándo intentar sincronizar
  useEffect(() => {
    const onOnline = () => setSyncStatus((s) => ({ ...s, online: true }));
    const onOffline = () => setSyncStatus((s) => ({ ...s, online: false }));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // 4. Función interna: procesar la cola de sync intentando subir cada cambio pendiente a Firebase.
  // Cada bloque (inventario, caja, ventas de un día, cierres de un mes…) se sube por separado:
  // si UNO falla por un motivo propio (permisos, tamaño), los demás siguen subiendo. Solo si se cae
  // la conexión se detiene todo, porque los demás fallarían igual.
  const syncRunning = useRef(false);
  const fallosPorBloque = useRef({}); // key -> { n: intentos fallidos seguidos, code }
  const processQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    if (!sesionActiva()) return; // sin sesión Firebase rechaza todo; se reintenta cuando haya sesión
    if (syncRunning.current) return; // evitar dos subidas simultáneas (interval + persist inmediato)
    syncRunning.current = true;
    let repetir = false;
    try {
      const queue = lsGet("sync_queue", {});
      const keys = Object.keys(queue);
      const fallos = fallosPorBloque.current;

      let failed = 0;
      let redCaida = false;
      for (const key of keys) {
        // Finanzas y pedidos son solo del admin: la caja no los sube (siguen guardados en este PC).
        if (SOLO_ADMIN_KEYS.includes(key)) {
          const cur = lsGet("sync_queue", {});
          delete cur[key];
          lsSet("sync_queue", cur);
          continue;
        }
        // Compatibilidad: colas viejas con "ventas" o "cierres" ya se migraron a documentos
        // fragmentados. Las descartamos para que no intenten subir un paquete de más de 1 MB.
        if (key === "ventas" || key === "cierres") {
          const cur = lsGet("sync_queue", {});
          delete cur[key];
          lsSet("sync_queue", cur);
          continue;
        }
        try {
          const snapshot = queue[key]; // {value, encoladoEn, ...}
          if (key.startsWith("vd:")) {
            const fecha = snapshot.fecha || key.slice(3);
            await setDoc(doc(db, VENTAS_COLLECTION, fecha), { ventas: snapshot.value, actualizadoEn: Date.now() });
          } else if (key.startsWith("cm:")) {
            const mes = snapshot.mes || key.slice(3);
            await setDoc(doc(db, CIERRES_COLLECTION, mes), { cierres: snapshot.value, actualizadoEn: Date.now() });
          } else {
            await setDoc(doc(db, DOC_COLLECTION, key), { value: snapshot.value, actualizadoEn: Date.now() });
          }
          delete fallos[key];
          // Éxito: sacar de la cola SOLO si no fue re-encolado con un valor más nuevo durante la subida
          const current = lsGet("sync_queue", {});
          if (current[key] && current[key].encoladoEn === snapshot.encoladoEn) {
            delete current[key];
            lsSet("sync_queue", current);
          }
          // si encoladoEn cambió, hay un valor más nuevo pendiente: se subirá en la próxima pasada
        } catch (e) {
          console.warn("Error subiendo a Firebase (queda en cola)", key, e);
          failed++;
          if (esErrorDeRed(e)) { redCaida = true; break; } // sin conexión: los demás fallarían igual
          // Error propio de este bloque: se recuerda y se sigue con los demás
          fallos[key] = { n: ((fallos[key] && fallos[key].n) || 0) + 1, code: (e && e.code) || "error" };
        }
      }

      // Copia permanente (solo-agregar) de la bitácora de inventario en la nube.
      // Se intenta aunque otro bloque haya fallado, mientras haya conexión.
      if (!redCaida) {
        const bp = lsGet("bitacora_pendiente", []);
        if (bp.length > 0) {
          const enviados = [];
          for (const m of bp) {
            try {
              await setDoc(doc(db, "bitacora_inv", m.id), m);
              enviados.push(m.id);
            } catch (e) {
              if (e && e.code === "permission-denied") { enviados.push(m.id); continue; } // ya existe: no se sobrescribe
              break;
            }
          }
          if (enviados.length > 0) {
            lsSet("bitacora_pendiente", lsGet("bitacora_pendiente", []).filter((m) => !enviados.includes(m.id)));
          }
        }
      }

      // Si un bloque lleva 3 intentos fallidos por un motivo propio (no de conexión), avisar en pantalla.
      // El resto de la app sigue funcionando y todo queda guardado en este PC.
      const colaFinal = lsGet("sync_queue", {});
      const atascados = Object.keys(fallos).filter((k) => colaFinal[k] && fallos[k].n >= 3);
      Object.keys(fallos).forEach((k) => { if (!colaFinal[k]) delete fallos[k]; });
      if (atascados.length > 0) {
        const lista = atascados.slice(0, 3).map(nombreBloque).join(", ") + (atascados.length > 3 ? "…" : "");
        setStorageError(`No se está subiendo a la nube: ${lista}. Todo sigue guardado en este PC; avisa al administrador.`);
      } else {
        setStorageError((prev) => (prev && prev.startsWith("No se está subiendo a la nube") ? null : prev));
      }

      setSyncStatus((s) => ({
        ...s,
        pending: Object.keys(colaFinal).length,
        lastSync: failed === 0 ? Date.now() : s.lastSync,
      }));

      // Si mientras se subía entró algo nuevo a la cola (una venta recién hecha, por ejemplo), no esperar
      // 30 segundos: se hace otra pasada enseguida. Los bloques atascados no cambian, así que no hay bucle.
      if (!redCaida) {
        repetir = Object.keys(colaFinal).some((k) => !queue[k] || queue[k].encoladoEn !== colaFinal[k].encoladoEn);
      }
    } finally {
      syncRunning.current = false;
    }
    if (repetir) setTimeout(() => processQueue(), 200);
  }, []);

  // 5-bis. Migración (solo una vez): dividir las ventas y los cierres acumulados en documentos
  // por día (ventas) y por mes (cierres), para que ningún documento llegue al límite de 1 MB.
  // Trabaja sobre LocalStorage (que es la fuente de verdad del PC) y encola todos los
  // días/meses para subir. No borra nada.
  useEffect(() => {
    if (modo !== "caja" || !ready) return;
    if (lsGet("migrado_fragmentado", false)) return;
    const ventas = lsGet("ventas", []);
    const cierres = lsGet("cierres", []);
    const queue = lsGet("sync_queue", {});
    const ahora = Date.now();
    for (const [fecha, arr] of agruparPorFecha(ventas)) {
      queue[`vd:${fecha}`] = { value: arr, fecha, encoladoEn: ahora };
    }
    for (const [mes, arr] of agruparPorMes(cierres)) {
      queue[`cm:${mes}`] = { value: arr, mes, encoladoEn: ahora };
    }
    // Las colas viejas con un solo paquete gigante ya no se usan: se descartan.
    delete queue["ventas"];
    delete queue["cierres"];
    lsSet("sync_queue", queue);
    lsSet("migrado_fragmentado", true);
    setSyncStatus((s) => ({ ...s, pending: Object.keys(queue).length }));
    if (navigator.onLine) processQueue();
  }, [modo, ready, processQueue]);

  // 5. Reintentar la cola cada 30 segundos si hay conexión + al volver internet (solo modo caja)
  useEffect(() => {
    if (!ready || esConsulta) return;
    processQueue();
    const interval = setInterval(processQueue, 30_000);
    const onOnline = () => processQueue();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
    };
  }, [ready, processQueue, esConsulta, syncStatus.authed]);

  // Claves que el dueño puede editar desde el celular (modo consulta) sin tocar los datos de ventas.
  // Son bloques que solo el dueño maneja, así que no chocan con lo que registra la caja.
  const CLAVES_GESTION = ["personal", "movs_financieros", "config", "menu", "consumo_interno", "categorias", "pedidos_insumos"];

  // 6. Guardar: primero LocalStorage (siempre), luego encolar para Firebase.
  // Para ventas y cierres se encola solo lo que cambió, agrupado por día (ventas) o mes (cierres).
  // Así ningún documento en la nube pasa del límite de 1 MB de Firestore.
  const persist = useCallback((key, value) => {
    if (esConsulta) {
      // En modo consulta solo se permiten los bloques de gestión, y van DIRECTO a Firebase
      // (el celular no es fuente de verdad; escribe a la nube y el PC lo recibe por su listener).
      if (!CLAVES_GESTION.includes(key)) {
        console.warn("Modo consulta: escritura bloqueada para", key);
        return;
      }
      if (!navigator.onLine) {
        setStorageError("Sin conexión: no se pudo guardar. Vuelve a intentar cuando tengas internet.");
        return;
      }
      setDoc(doc(db, DOC_COLLECTION, key), { value, actualizadoEn: Date.now() })
        .then(() => setStorageError(null))
        .catch((e) => {
          console.error("Error guardando desde consulta", key, e);
          setStorageError("No se pudo guardar en la nube. Revisa tu conexión.");
        });
      return;
    }
    // Leer el valor viejo ANTES de sobrescribirlo (para saber qué días/meses cambiaron)
    const previo = (key === "ventas" || key === "cierres") ? lsGet(key, []) : null;
    const ok = lsSet(key, value);
    if (!ok) {
      setStorageError("No se pudo guardar en el almacenamiento local. Revisa el modo incógnito o el espacio del navegador.");
      return;
    }
    setStorageError(null);
    const queue = lsGet("sync_queue", {});
    const ahora = Date.now();
    if (key === "ventas") {
      // Fragmentar por día: solo se encolan los días cuyo contenido cambió.
      const nextMap = agruparPorFecha(value);
      const prevMap = agruparPorFecha(previo);
      for (const [fecha, arr] of nextMap) {
        const prevArr = prevMap.get(fecha);
        if (!prevArr || JSON.stringify(prevArr) !== JSON.stringify(arr)) {
          queue[`vd:${fecha}`] = { value: arr, fecha, encoladoEn: ahora };
        }
      }
      for (const [fecha] of prevMap) {
        if (!nextMap.has(fecha)) queue[`vd:${fecha}`] = { value: [], fecha, encoladoEn: ahora };
      }
    } else if (key === "cierres") {
      // Fragmentar por mes: igual criterio.
      const nextMap = agruparPorMes(value);
      const prevMap = agruparPorMes(previo);
      for (const [mes, arr] of nextMap) {
        const prevArr = prevMap.get(mes);
        if (!prevArr || JSON.stringify(prevArr) !== JSON.stringify(arr)) {
          queue[`cm:${mes}`] = { value: arr, mes, encoladoEn: ahora };
        }
      }
      for (const [mes] of prevMap) {
        if (!nextMap.has(mes)) queue[`cm:${mes}`] = { value: [], mes, encoladoEn: ahora };
      }
    } else {
      queue[key] = { value, encoladoEn: ahora };
    }
    lsSet("sync_queue", queue);
    setSyncStatus((s) => ({ ...s, pending: Object.keys(queue).length }));
    // Intentar subir de inmediato si hay conexión (sin esperar el intervalo)
    if (navigator.onLine) processQueue();
  }, [processQueue, esConsulta]);

  const saveInsumos = useCallback((next) => { setInsumos(next); persist("insumos", next); }, [persist]);
  const saveMenu = useCallback((next) => { setMenu(next); persist("menu", next); }, [persist]);
  const saveConsumoInterno = useCallback((next) => { setConsumoInterno(next); persist("consumo_interno", next); }, [persist]);

  // Bitácora de inventario: registro permanente de cada cambio manual de stock.
  // Se limita a los últimos 500 movimientos para no exceder el tamaño máximo de un documento en Firestore.
  const registrarMovInv = useCallback((registros) => {
    // Cada movimiento lleva el nombre del cajero del turno (quién lo hizo)
    const por = (lsGet("caja_actual", null) || {}).cajero || "sin turno abierto";
    const lista = (Array.isArray(registros) ? registros : [registros]).map((r) => ({ ...r, por: r.por || por }));
    setMovsInventario((prev) => {
      const next = [...prev, ...lista].slice(-500);
      persist("movs_inventario", next);
      return next;
    });
    // Copia permanente en la nube (colección aparte, no se puede modificar ni borrar desde la caja)
    lsSet("bitacora_pendiente", [...lsGet("bitacora_pendiente", []), ...lista].slice(-2000));
    if (navigator.onLine) processQueue();
  }, [persist, processQueue]);
  const saveVentas = useCallback((next) => { setVentas(next); persist("ventas", next); }, [persist]);
  const saveCierres = useCallback((next) => { setCierres(next); persist("cierres", next); }, [persist]);
  const saveCaja = useCallback((next) => { setCajaAbierta(next); persist("caja_actual", next); }, [persist]);
  const saveMovs = useCallback((next) => { setMovimientosCaja(next); persist("movimientos_caja", next); }, [persist]);
  const saveConfig = useCallback((next) => { setConfig(next); persist("config", next); }, [persist]);
  const saveCategorias = useCallback((next) => { setCategorias(next); persist("categorias", next); }, [persist]);
  const savePedidosInsumos = useCallback((next) => { setPedidosInsumos(next); persist("pedidos_insumos", next); }, [persist]);
  const savePersonal = useCallback((next) => { setPersonal(next); persist("personal", next); }, [persist]);
  const saveMovsFinancieros = useCallback((next) => { setMovsFinancieros(next); persist("movs_financieros", next); }, [persist]);

  // Forzar sincronización manual (botón en la UI)
  // Lectura de respaldo de los bloques que edita el admin (por si el escuchador en vivo se cae o
  // el PC estuvo apagado). Se ejecuta al conectar, al volver internet, cada minuto y al tocar "Sincronizar".
  const traerGestion = useCallback(async () => {
    if (modo !== "caja" || !navigator.onLine) return;
    const setters = { menu: setMenu, consumo_interno: setConsumoInterno, config: setConfig, categorias: setCategorias };
    let errores = 0;
    for (const key of Object.keys(setters)) {
      if (lsGet("sync_queue", {})[key]) continue; // cambio local pendiente: manda el local
      try {
        const snap = await getDoc(doc(db, DOC_COLLECTION, key));
        if (!snap.exists()) continue;
        const val = snap.data().value;
        if (JSON.stringify(lsGet(key, null)) === JSON.stringify(val)) continue;
        setters[key](val);
        lsSet(key, val);
      } catch (e) {
        errores++;
        console.warn("No se pudo leer de la nube", key, e);
      }
    }
    if (errores > 0) setStorageError("No se reciben los cambios del admin (revisa internet o las reglas de Firebase).");
    else setStorageError((prev) => (prev && prev.startsWith("No se reciben") ? null : prev));
  }, [modo]);

  useEffect(() => {
    if (modo !== "caja" || !syncStatus.authed || !ready) return;
    traerGestion();
    const t = setInterval(traerGestion, 60_000);
    const onOnline = () => traerGestion();
    window.addEventListener("online", onOnline);
    return () => { clearInterval(t); window.removeEventListener("online", onOnline); };
  }, [modo, syncStatus.authed, ready, traerGestion]);

  const forzarSync = useCallback(() => { processQueue(); traerGestion(); }, [processQueue, traerGestion]);

  // Datos para respaldo. En la caja sale lo guardado en el PC (sin finanzas: esas son solo del admin);
  // en el admin sale todo lo que ve en vivo desde la nube.
  const datosRespaldo = useCallback(() => {
    if (esConsulta) {
      return {
        insumos, ventas, cierres, caja_actual: cajaAbierta, movimientos_caja: movimientosCaja,
        movs_inventario: movsInventario, menu, consumo_interno: consumoInterno, personal,
        movs_financieros: movsFinancieros, config, categorias, pedidos_insumos: pedidosInsumos,
      };
    }
    return {
      insumos: lsGet("insumos", INSUMOS_INICIALES),
      ventas: lsGet("ventas", []),
      cierres: lsGet("cierres", []),
      caja_actual: lsGet("caja_actual", null),
      movimientos_caja: lsGet("movimientos_caja", []),
      movs_inventario: lsGet("movs_inventario", []),
      menu: lsGet("menu", MENU_INICIAL),
      consumo_interno: lsGet("consumo_interno", CONSUMO_INTERNO_INICIAL),
      config: lsGet("config", {}),
      categorias: lsGet("categorias", CATEGORIAS_INICIALES),
    };
  }, [esConsulta, insumos, ventas, cierres, cajaAbierta, movimientosCaja, movsInventario, menu, consumoInterno, personal, movsFinancieros, config, categorias, pedidosInsumos]);

  // Exportar respaldo completo como archivo JSON
  const exportarRespaldo = useCallback(() => {
    const respaldo = { version: 2, generadoEn: new Date().toISOString(), ...datosRespaldo() };
    const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gordo-pizzeria_respaldo_${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [datosRespaldo]);

  // Importar respaldo desde archivo (recuperación en caso de pérdida)
  const importarRespaldo = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (data.insumos) { setInsumos(data.insumos); persist("insumos", data.insumos); }
          if (data.ventas) { setVentas(data.ventas); persist("ventas", data.ventas); }
          if (data.cierres) { setCierres(data.cierres); persist("cierres", data.cierres); }
          if (data.caja_actual !== undefined) { setCajaAbierta(data.caja_actual); persist("caja_actual", data.caja_actual); }
          if (data.movimientos_caja) { setMovimientosCaja(data.movimientos_caja); persist("movimientos_caja", data.movimientos_caja); }
          if (data.movs_inventario) { setMovsInventario(data.movs_inventario); persist("movs_inventario", data.movs_inventario); }
          if (data.menu) { setMenu(data.menu); persist("menu", data.menu); }
          if (data.consumo_interno) { setConsumoInterno(data.consumo_interno); persist("consumo_interno", data.consumo_interno); }
          if (data.personal) { setPersonal(data.personal); persist("personal", data.personal); }
          if (data.movs_financieros) { setMovsFinancieros(data.movs_financieros); persist("movs_financieros", data.movs_financieros); }
          if (data.config) { setConfig(data.config); persist("config", data.config); }
          if (data.categorias) { setCategorias(data.categorias); persist("categorias", data.categorias); }
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }, [persist]);

  // Admin → PC: el admin deja una orden en la nube; la caja la aplica UNA sola vez cuando está conectada.
  const enviarComando = useCallback(async (cmd) => {
    if (!navigator.onLine) throw new Error("sin conexión");
    await addDoc(collection(db, "comandos"), { ...cmd, estado: "pendiente", ts: Date.now(), por: email || "admin" });
  }, [email]);

  const aplicandoCmd = useRef(false);
  const aplicarComandos = useCallback(async (pend) => {
    if (aplicandoCmd.current) return;
    aplicandoCmd.current = true;
    try {
      const hechos = new Set(lsGet("cmds_aplicados", []));
      let vs = lsGet("ventas", []);
      let ins = lsGet("insumos", INSUMOS_INICIALES);
      const menuActual = lsGet("menu", MENU_INICIAL);
      let cambioV = false, cambioI = false;
      const resultados = [];
      for (const c of pend) {
        if (hechos.has(c.id)) { resultados.push({ c, res: "ya_aplicada" }); continue; }
        const v = vs.find((x) => x.id === c.ventaId);
        let res = "sin_efecto";
        if (c.tipo === "anular_venta" && v && !v.anulada) {
          ins = restoreStock(ins, v.items.map((it) => ({ itemId: it.itemId, cant: it.cant })), menuActual);
          vs = vs.map((x) => (x.id === v.id ? { ...x, anulada: true, anuladaTs: Date.now(), anuladaPor: "admin", motivoAnulacion: c.motivo || null } : x));
          cambioV = true; cambioI = true; res = "aplicado";
        } else if (c.tipo === "editar_datos_venta" && v && !v.anulada) {
          const ch = c.cambios || {};
          const nv = { ...v, editada: true, editadaTs: Date.now(), editadaPor: "admin" };
          if ("nombreCliente" in ch) nv.nombreCliente = (ch.nombreCliente || "").trim() || null;
          if (v.tipoVenta === "cliente" && ch.tipoEntrega && TIPOS_ENTREGA.includes(ch.tipoEntrega)) nv.tipoEntrega = ch.tipoEntrega;
          if ("direccion" in ch) nv.direccion = (ch.direccion || "").trim() || null;
          if (v.tipoVenta === "cliente" && ["efectivo", "transferencia", "tarjeta"].includes(ch.metodoPago)) {
            nv.metodoPago = ch.metodoPago;
            nv.pagosMixtos = null;
            if (ch.metodoPago !== "efectivo") nv.montoRecibido = null;
            if (!v.pagadoEn) nv.pagadoEn = Date.now();
          }
          vs = vs.map((x) => (x.id === v.id ? nv : x));
          cambioV = true; res = "aplicado";
        }
        hechos.add(c.id);
        resultados.push({ c, res });
      }
      if (cambioI) saveInsumos(ins);
      if (cambioV) saveVentas(vs);
      lsSet("cmds_aplicados", [...hechos].slice(-500));
      for (const { c, res } of resultados) {
        updateDoc(doc(db, "comandos", c.id), { estado: "aplicado", aplicadoEn: Date.now(), resultado: res }).catch(() => {});
      }
    } finally {
      aplicandoCmd.current = false;
    }
  }, [saveInsumos, saveVentas]);

  useEffect(() => {
    if (modo !== "caja" || !syncStatus.authed || !ready) return;
    const q = query(collection(db, "comandos"), where("estado", "==", "pendiente"));
    return onSnapshot(
      q,
      (snap) => {
        const pend = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        if (pend.length > 0) aplicarComandos(pend);
      },
      (e) => console.warn("No se pudieron leer las órdenes del admin", e)
    );
  }, [modo, syncStatus.authed, ready, aplicarComandos]);

  return {
    categorias, saveCategorias, pedidosInsumos, savePedidosInsumos, comandos, enviarComando, datosRespaldo,
    rol, email,
    ready, insumos, saveInsumos, menu, saveMenu, consumoInterno, saveConsumoInterno,
    movsInventario, registrarMovInv, ventas, saveVentas, cierres, saveCierres,
    cajaAbierta, saveCaja, movimientosCaja, saveMovs, storageError,
    config, saveConfig, personal, savePersonal, movsFinancieros, saveMovsFinancieros,
    syncStatus, forzarSync, exportarRespaldo, importarRespaldo,
    modo, setModo, esConsulta,
  };
}

// ============================================================
// APP PRINCIPAL
// ============================================================
// Los modales se dibujan directo en <body> (fuera del área con scroll). Así quedan siempre fijos a la pantalla,
// cubren todo (también barra superior e inferior) y al deslizar se mueve el detalle, no la página de atrás.
let modalesAbiertos = 0;
function ModalPortal({ children }) {
  useEffect(() => {
    modalesAbiertos += 1;
    document.body.classList.add("modal-open");
    return () => {
      modalesAbiertos -= 1;
      if (modalesAbiertos <= 0) { modalesAbiertos = 0; document.body.classList.remove("modal-open"); }
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

// Logo de la pizzería. Imagen pequeña (14 KB) servida desde /public y guardada por la PWA para uso sin internet.
// Es un <img> con tamaño fijo: no bloquea el arranque ni mueve el diseño, y si no carga se muestra el ícono de pizza.
function Logo({ size = 44, radius = 12, style }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) {
    return (
      <div style={{ ...S.brandIcon, width: size, height: size, borderRadius: radius, ...style }}>
        <Pizza size={Math.round(size * 0.55)} color="#fff" strokeWidth={2.4} />
      </div>
    );
  }
  return (
    <img
      src="/logo-gordo.png"
      width={size}
      height={size}
      alt="Gordo Pizzería"
      decoding="async"
      draggable={false}
      onError={() => setFallo(true)}
      style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", display: "block", flexShrink: 0, border: `1px solid ${COLORS.border}`, ...style }}
    />
  );
}

export default function GordoPizzeriaApp() {
  const [sesion, setSesion] = useState({ cargando: true, rol: null, email: null });
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        setSesion({ cargando: false, rol: rolDeEmail(user.email), email: user.email });
      } else {
        setSesion({ cargando: false, rol: null, email: null });
      }
    });
  }, []);
  if (sesion.cargando) {
    return (
      <div style={S.loadingScreen}>
        <div style={S.loadingCard}>
          <Logo size={84} radius={20} />
          <Loader2 className="spin" size={22} color="#822D1B" style={{ marginTop: 14 }} />
        </div>
        <style>{globalCss}</style>
      </div>
    );
  }
  if (!sesion.rol) return <LoginScreen />;
  return <GordoPizzeriaMain key={sesion.rol} rol={sesion.rol} email={sesion.email} />;
}

// ============================================================
// LOGIN (correo y contraseña con Firebase Authentication)
// ============================================================
function LoginScreen() {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    setError("");
    const u = usuario.trim().toLowerCase();
    const email = u.includes("@") ? u : `${u}@gordo.com`;
    if (!u || !clave) { setError("Ingresa usuario y contraseña"); return; }
    setCargando(true);
    try {
      await signInWithEmailAndPassword(auth, email, clave);
    } catch (e) {
      const c = e && e.code;
      if (c === "auth/network-request-failed" || !navigator.onLine) {
        setError("Sin internet: el primer ingreso en este equipo necesita conexión.");
      } else if (c === "auth/too-many-requests") {
        setError("Demasiados intentos. Espera unos minutos.");
      } else {
        setError("Usuario o contraseña incorrectos");
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={S.modoScreen}>
      <style>{globalCss}</style>
      <div style={S.modoCard}>
        <Logo size={88} radius={22} style={{ marginBottom: 6 }} />
        <div style={S.modoTitle}>Gordo Pizzería</div>
        <div style={S.modoSub}>Inicia sesión para continuar</div>
        <input
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="Usuario (caja o admin)"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          style={{ ...S.cajaInput, textAlign: "left", marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          style={{ ...S.cajaInput, textAlign: "left" }}
        />
        {error && <div style={{ color: "#B4271A", fontSize: 13, fontWeight: 700, marginTop: 10 }}>{error}</div>}
        <button onClick={entrar} disabled={cargando} style={S.cajaOpenBtn}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}

function GordoPizzeriaMain({ rol, email }) {
  const store = useStorage(rol, email);
  const isMobile = useIsMobile();
  const [modulo, setModulo] = useState("ventas"); // 'ventas' | 'admin' | 'financiero'
  const [tab, setTab] = useState(rol === "admin" ? "envivo" : "pos");
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type, id: uid() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // El admin no vende: arranca en el panel En vivo
  useEffect(() => {
    if (store.esConsulta && tab === "pos") setTab("envivo");
  }, [store.esConsulta, tab]);

  // Cambiar de módulo. Administración y Finanzas existen SOLO para el usuario admin (ya se
  // identificó con su contraseña, por eso no hay PIN). La caja nunca los ve.
  const irAModulo = (m) => {
    if (m === "ventas") {
      setModulo("ventas");
      setTab(store.esConsulta ? "envivo" : "pos");
      return;
    }
    if (!store.esConsulta) return;
    if (m === "financiero" && !MODULO_FINANZAS_ACTIVO) return;
    setModulo(m);
    setTab(m === "admin" ? "productos" : "resumen");
  };

  if (!store.ready) {
    return (
      <div style={S.loadingScreen}>
        <div style={S.loadingCard}>
          <Logo size={84} radius={20} />
          <Loader2 className="spin" size={22} color="#822D1B" style={{ marginTop: 14 }} />
          <div style={{ marginTop: 10, fontWeight: 700, color: "#5A1610", fontSize: 15 }}>
            {store.esConsulta ? "Conectando con la caja…" : "Cargando Gordo Pizzería…"}
          </div>
        </div>
        <style>{globalCss}</style>
      </div>
    );
  }

  const cajaAbierta = !!store.cajaAbierta;
  const pendientesCount = store.ventas.filter((v) => v.metodoPago === "pendiente" && !v.anulada).length;

  return (
    <div style={{ ...S.app, ...(isMobile ? S.appMobile : {}) }}>
      <style>{globalCss}</style>
      <Sidebar
        modulo={modulo}
        tab={tab}
        setTab={setTab}
        irAModulo={irAModulo}
        cajaAbierta={cajaAbierta}
        pendientesCount={pendientesCount}
        esConsulta={store.esConsulta}
        onCambiarModo={() => { if (window.confirm("¿Cerrar sesión? Para volver a entrar en este equipo se necesita internet.")) store.setModo(); }}
        isMobile={isMobile}
      />
      <div style={S.main}>
        <TopBar modulo={modulo} tab={tab} cajaAbierta={cajaAbierta} caja={store.cajaAbierta} syncStatus={store.syncStatus} onForzarSync={store.forzarSync} esConsulta={store.esConsulta} isMobile={isMobile}
          irAModulo={irAModulo}
          onCambiarModo={() => { if (window.confirm("¿Cerrar sesión? Para volver a entrar en este equipo se necesita internet.")) store.setModo(); }} />
        {isMobile && store.esConsulta && (
          <MobileSectionTabs
            items={getTabsPorModulo(true)[modulo] || []}
            tab={tab}
            setTab={setTab}
            pendientesCount={pendientesCount}
            cajaAbierta={cajaAbierta}
          />
        )}
        {store.esConsulta && (
          <div style={{ ...S.consultaBar, ...(isMobile ? { padding: "9px 16px", fontSize: 12 } : {}) }}>
            👁️ Panel de administración — viendo la caja en vivo. Las ventas solo se registran en el PC del local.
          </div>
        )}
        {store.storageError && (
          <div style={S.storageWarnBar}>
            <AlertTriangle size={16} />
            {store.storageError}
          </div>
        )}
        <div className="app-content" style={{ ...S.content, ...(isMobile ? S.contentMobile : {}), ...(isMobile && store.esConsulta ? { paddingBottom: 104 } : {}) }}>
          {/* MÓDULO VENTAS */}
          {modulo === "ventas" && tab === "pos" && !store.esConsulta && <POSView store={store} showToast={showToast} isMobile={isMobile} />}
          {modulo === "ventas" && tab === "historial" && <HistorialView store={store} showToast={showToast} isMobile={isMobile} />}
          {modulo === "ventas" && tab === "inventario" && <InventarioView store={store} showToast={showToast} isMobile={isMobile} />}
          {modulo === "ventas" && tab === "envivo" && store.esConsulta && <EnVivoView store={store} isMobile={isMobile} />}
          {modulo === "ventas" && tab === "caja" && (
            <>
              <CajaView store={store} showToast={showToast} isMobile={isMobile} />
              {!store.esConsulta && <div style={{ marginTop: 24 }}><BackupBlock store={store} /></div>}
            </>
          )}
          {modulo === "ventas" && tab === "reportes" && store.esConsulta && <ReportesView store={store} isMobile={isMobile} />}

          {/* MÓDULO ADMINISTRATIVO (solo admin) */}
          {modulo === "admin" && store.esConsulta && <AdminView store={store} tab={tab} showToast={showToast} isMobile={isMobile} />}

          {/* MÓDULO FINANCIERO (solo admin) */}
          {MODULO_FINANZAS_ACTIVO && modulo === "financiero" && store.esConsulta && <FinancieroView store={store} tab={tab} showToast={showToast} isMobile={isMobile} />}
        </div>
      </div>
      {toast && <Toast toast={toast} />}
    </div>
  );
}

// ============================================================
// PANEL EN VIVO (solo admin): lo que pasa ahora en la caja
// ============================================================
function EnVivoView({ store, isMobile }) {
  const hoy = todayStr();
  const caja = store.cajaAbierta;
  const cobradasHoy = store.ventas.filter((v) => !v.anulada && v.metodoPago !== "pendiente" && v.tipoVenta !== "interno" && localDateStr(new Date(fechaPagoDe(v))) === hoy);
  const totalHoy = cobradasHoy.reduce((s, v) => s + v.total, 0);
  const efectivoHoy = cobradasHoy.reduce((s, v) => s + montoPorMetodo(v, "efectivo"), 0);
  const otrosHoy = totalHoy - efectivoHoy;
  const pendientes = store.ventas.filter((v) => v.metodoPago === "pendiente" && !v.anulada);
  const totalPendiente = pendientes.reduce((s, v) => s + v.total, 0);
  const ultimas = store.ventas.slice().sort((a, b) => b.ts - a.ts).slice(0, 12);
  const bajos = store.insumos.filter((i) => i.activo !== false && i.stock <= i.minimo);
  const movs = (store.movsInventario || []).slice(-6).reverse();
  const ordenesPend = (store.comandos || []).filter((c) => c.estado === "pendiente");

  return (
    <div>
      <div style={{ ...S.chartCard, borderColor: caja ? "#2E9E5B" : COLORS.border }}>
        <div style={S.breakdownTitle}>{caja ? "🟢 Caja abierta" : "🔴 Caja cerrada"}</div>
        {caja ? (
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.inkSoft }}>
            Cajero: <b>{caja.cajero || "sin nombre"}</b> · desde {fullDateTime(caja.abiertaTs)} · efectivo inicial {CLP(caja.efectivoInicial)}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: COLORS.muted }}>No hay turno abierto en este momento.</div>
        )}
        {ordenesPend.length > 0 && (
          <div style={{ marginTop: 10, color: "#B8860B", fontWeight: 700, fontSize: 13 }}>
            ⏳ {ordenesPend.length} orden(es) tuya(s) esperando que el PC de la caja se conecte
          </div>
        )}
      </div>

      <div className="stats-row" style={S.statsRow}>
        <StatCard icon={DollarSign} label="Cobrado hoy" value={CLP(totalHoy)} color="#822D1B" />
        <StatCard icon={Wallet} label="En efectivo" value={CLP(efectivoHoy)} color="#2E9E5B" />
        <StatCard icon={ReceiptText} label="Transferencia / tarjeta" value={CLP(otrosHoy)} color="#3A5FA0" />
        <StatCard icon={Clock} label={`Por cobrar (${pendientes.length})`} value={CLP(totalPendiente)} color="#B8860B" alert={pendientes.length > 0} />
      </div>

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Últimos pedidos</div>
        {ultimas.length === 0 && <div style={S.emptyState}>Todavía no hay ventas</div>}
        {ultimas.map((v) => (
          <div key={v.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13.5 }}>
            <div style={{ minWidth: 0 }}>
              <b>#{v.numeroPedido ?? "—"}</b> · {v.hora} · {v.tipoVenta === "interno" ? `Interno — ${v.socioInterno}` : (v.nombreCliente || "Cliente")}
              {v.tipoEntrega && <span style={S.entregaChip}>{LABEL_ENTREGA[v.tipoEntrega]}</span>}
              <div style={{ fontSize: 12, color: COLORS.muted }}>
                {(v.items || []).map((i) => `${i.cant}× ${i.nombre}`).join(", ")}{v.direccion ? ` · 📍 ${v.direccion}` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontWeight: 800, textDecoration: v.anulada ? "line-through" : "none" }}>{CLP(v.total)}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: v.anulada ? "#B4271A" : v.metodoPago === "pendiente" ? "#B8860B" : COLORS.muted }}>
                {v.anulada ? "ANULADA" : labelMetodoPago(v)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Stock bajo ({bajos.length})</div>
        {bajos.length === 0 ? (
          <div style={{ fontSize: 13, color: COLORS.muted }}>Todo el inventario está sobre el mínimo.</div>
        ) : bajos.map((i) => (
          <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13.5 }}>
            <span style={{ fontWeight: 700 }}>{i.nombre}</span>
            <span style={{ color: "#B4271A", fontWeight: 800 }}>{i.stock} {i.unidad} (mín. {i.minimo})</span>
          </div>
        ))}
      </div>

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Últimos movimientos de inventario</div>
        {movs.length === 0 && <div style={{ fontSize: 13, color: COLORS.muted }}>Sin movimientos manuales.</div>}
        {movs.map((m) => (
          <div key={m.id} style={{ fontSize: 13, padding: "5px 0" }}>
            {m.fecha} {m.hora} · <b>{m.por || "—"}</b> · {m.insumoNombre}: {m.cantAnterior} → {m.cantNueva} ({m.motivo}{m.nota ? `: ${m.nota}` : ""})
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// SIDEBAR
// ============================================================
// ============================================================
// SELECCIÓN DE MODO (primera vez en cada dispositivo)
// ============================================================
function SeleccionModo({ onElegir }) {
  return (
    <div style={S.modoScreen}>
      <style>{globalCss}</style>
      <div style={S.modoCard}>
        <Logo size={72} radius={18} style={{ marginBottom: 6 }} />
        <div style={S.modoTitle}>¿Qué es este dispositivo?</div>
        <div style={S.modoSub}>
          Esta configuración se guarda solo en este equipo. Puedes cambiarla después desde el menú lateral.
        </div>

        <button onClick={() => onElegir("caja")} style={S.modoOption}>
          <div style={S.modoOptionIcon}><ShoppingCart size={22} color="#822D1B" /></div>
          <div style={S.modoOptionText}>
            <div style={S.modoOptionTitle}>Caja principal</div>
            <div style={S.modoOptionDesc}>
              El PC del local donde se registran las ventas. Funciona sin internet y sube los datos a la nube cuando hay conexión.
            </div>
          </div>
        </button>

        <button onClick={() => onElegir("consulta")} style={S.modoOption}>
          <div style={{ ...S.modoOptionIcon, background: "#EAF3FB" }}><BarChart3 size={22} color="#3A5FA0" /></div>
          <div style={S.modoOptionText}>
            <div style={S.modoOptionTitle}>Solo consulta</div>
            <div style={S.modoOptionDesc}>
              Tu celular u otro equipo, para ver en vivo las ventas y la caja desde donde estés. Necesita internet y no registra ventas.
            </div>
          </div>
        </button>

        <div style={S.modoWarn}>
          ⚠️ Elige "Caja principal" solo en el PC del local. Si lo eliges en otro equipo, podrías sobrescribir los datos reales.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PIN MODAL — pide el PIN de administrador para módulos sensibles
// ============================================================
function PinModal({ titulo, onCancel, onConfirm }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const intentar = () => {
    const ok = onConfirm(pin);
    if (!ok) {
      setError(true);
      setPin("");
    }
  };

  return (
    <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={onCancel}>
      <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 34 }}>🔒</div>
        </div>
        <div style={{ ...S.modalTitle, textAlign: "center" }}>{titulo}</div>
        <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 16 }}>Ingresa el PIN de administrador</div>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") intentar(); }}
          placeholder="••••"
          autoFocus
          style={{ ...S.cajaInput, textAlign: "center", letterSpacing: 8, fontSize: 24, fontWeight: 800, ...(error ? { borderColor: "#B4271A" } : {}) }}
        />
        {error && <div style={{ color: "#B4271A", fontSize: 12.5, fontWeight: 700, textAlign: "center", marginTop: 8 }}>PIN incorrecto</div>}
        <div style={{ ...S.modalActions, marginTop: 18 }}>
          <button onClick={onCancel} style={S.modalCancel}>Cancelar</button>
          <button onClick={intentar} style={S.modalConfirm}>Entrar</button>
        </div>
      </div>
    </div></ModalPortal>
  );
}

// Secciones de cada módulo (las usan la barra lateral del PC y los botones de sección del celular)
function getTabsPorModulo(esConsulta) {
  return {
    ventas: [
      ...(esConsulta ? [{ id: "envivo", label: "En vivo", icon: Cloud }] : [{ id: "pos", label: "Ventas", icon: ShoppingCart }]),
      { id: "historial", label: "Historial", icon: Clock },
      { id: "inventario", label: "Inventario", icon: Boxes },
      { id: "caja", label: "Caja", icon: Wallet },
      ...(esConsulta ? [{ id: "reportes", label: "Reportes", icon: BarChart3 }] : []),
    ],
    admin: [
      { id: "productos", label: "Productos", icon: ChefHat },
      { id: "categorias", label: "Categorías", icon: Tags },
      { id: "personal", label: "Personal", icon: Users },
      { id: "permisos", label: "Inventario y bitácora", icon: ReceiptText },
      { id: "alertas", label: "Alertas", icon: AlertTriangle },
      { id: "ajustes", label: "Ajustes y respaldo", icon: Settings },
    ],
    financiero: [
      { id: "resumen", label: "Resumen", icon: BarChart3 },
      { id: "facturas", label: "Facturas y gastos", icon: ReceiptText },
      { id: "trabajadores", label: "Pago a personal", icon: Wallet },
      { id: "pedidos", label: "Pedidos de insumos", icon: Package },
      { id: "proveedores", label: "Pago a proveedores", icon: Boxes },
    ],
  };
}

// Celular (admin): fila de botones con las secciones del módulo, debajo del título.
function MobileSectionTabs({ items, tab, setTab, pendientesCount, cajaAbierta }) {
  const wrapRef = useRef(null);
  // Centra el botón activo para que siempre se vea completo
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const btn = wrap.querySelector('[data-active="true"]');
    if (!btn) return;
    const left = Math.max(0, btn.offsetLeft - (wrap.clientWidth - btn.offsetWidth) / 2);
    try { wrap.scrollTo({ left, behavior: "smooth" }); } catch (e) { wrap.scrollLeft = left; }
  }, [tab, items]);
  return (
    <div ref={wrapRef} className="section-tabs" style={S.sectionTabs}>
      {items.map((it) => {
        const active = tab === it.id;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            data-active={active ? "true" : "false"}
            onClick={() => setTab(it.id)}
            style={{ ...S.sectionTab, ...(active ? S.sectionTabActive : {}) }}
          >
            <Icon size={17} strokeWidth={2.2} />
            <span>{it.label}</span>
            {it.id === "historial" && pendientesCount > 0 && (
              <span style={{ ...S.sectionTabBadge, ...(active ? { background: "#fff", color: COLORS.red } : {}) }}>{pendientesCount}</span>
            )}
            {it.id === "caja" && (
              <span style={{ ...S.sectionTabDot, background: cajaAbierta ? "#2E9E5B" : "#C6C0BC" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function Sidebar({ modulo, tab, setTab, irAModulo, cajaAbierta, pendientesCount, esConsulta, onCambiarModo, isMobile }) {
  // Pestañas según el módulo activo
  const tabsPorModulo = getTabsPorModulo(esConsulta);
  const items = tabsPorModulo[modulo] || tabsPorModulo.ventas;

  // Admin y Finanzas están disponibles siempre (también desde el celular en consulta),
  // porque son bloques que solo el dueño edita y no chocan con las ventas de la caja.
  const modulos = esConsulta
    ? [
        { id: "ventas", label: "Ventas", icon: ShoppingCart },
        { id: "admin", label: "Administración", icon: Settings },
        ...(MODULO_FINANZAS_ACTIVO ? [{ id: "financiero", label: "Finanzas", icon: CircleDollarSign }] : []),
      ]
    : [{ id: "ventas", label: "Ventas", icon: ShoppingCart }];

  // En móvil: barra de navegación fija abajo (más cómoda con el pulgar)
  if (isMobile) {
    // Admin en el celular: abajo solo los 3 módulos (grandes y espaciados);
    // las secciones de cada módulo van arriba como botones (MobileSectionTabs).
    if (esConsulta) {
      return (
        <div style={S.bottomNav}>
          {modulos.map((m) => {
            const MIcon = m.icon;
            const active = modulo === m.id;
            return (
              <button
                key={m.id}
                onClick={() => irAModulo(m.id)}
                style={{ ...S.modNavBtn, ...(active ? S.modNavBtnActive : {}) }}
              >
                <span style={{ ...S.modNavIcon, ...(active ? S.modNavIconActive : {}) }}>
                  <MIcon size={22} strokeWidth={2.2} />
                </span>
                <span style={{ ...S.modNavLabel, ...(active ? { fontWeight: 800 } : {}) }}>{m.label}</span>
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <>
      <div style={S.bottomNav}>
        {items.map((it) => {
          const active = tab === it.id;
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              style={{ ...S.bottomNavBtn, ...(active ? S.bottomNavBtnActive : {}) }}
            >
              <div style={{ position: "relative" }}>
                <Icon size={21} strokeWidth={2.2} />
                {it.id === "historial" && pendientesCount > 0 && (
                  <span style={S.bottomNavBadge}>{pendientesCount}</span>
                )}
                {it.id === "caja" && (
                  <span style={{ ...S.bottomNavDot, background: cajaAbierta ? "#2E9E5B" : "#C6C0BC" }} />
                )}
              </div>
              <span style={S.bottomNavLabel}>{it.label}</span>
            </button>
          );
        })}
      </div>
      </>
    );
  }

  return (
    <div style={S.sidebar}>
      <div style={S.brandBlock}>
        <Logo size={50} radius={13} />
        <div>
          <div style={S.brandName}>GORDO PIZZERÍA</div>
          <div style={S.brandSub}>{esConsulta ? "Administrador" : "Caja"}</div>
        </div>
      </div>

      {/* Selector de módulo */}
      {modulos.length > 1 && (
        <div style={S.moduloSelector}>
          {modulos.map((m) => {
            const MIcon = m.icon;
            const active = modulo === m.id;
            return (
              <button
                key={m.id}
                onClick={() => irAModulo(m.id)}
                style={{ ...S.moduloBtn, ...(active ? S.moduloBtnActive : {}) }}
                title={m.label}
              >
                <MIcon size={16} strokeWidth={2.3} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={S.navList}>
        {items.map((it) => {
          const active = tab === it.id;
          const Icon = it.icon;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              style={{ ...S.navBtn, ...(active ? S.navBtnActive : {}) }}
            >
              <Icon size={22} strokeWidth={2.2} />
              <span>{it.label}</span>
              {it.id === "caja" && (
                <span style={{ ...S.cajaDot, background: cajaAbierta ? "#2E9E5B" : "#C6C0BC" }} />
              )}
              {it.id === "historial" && pendientesCount > 0 && (
                <span style={S.navBadge}>{pendientesCount}</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={S.sidebarFooter}>
        <div style={S.cajaStatusPill(cajaAbierta)}>
          <span style={{ ...S.cajaDotSmall, background: cajaAbierta ? "#2E9E5B" : "#B4443B" }} />
          {cajaAbierta ? "Caja abierta" : "Caja cerrada"}
        </div>
        <button onClick={onCambiarModo} style={S.cambiarModoBtn}>
          {esConsulta ? "👁️ Admin" : "🖥️ Caja"} · cerrar sesión
        </button>
      </div>
    </div>
  );
}

// Menú de cuenta para el celular: cambiar de módulo (admin) y cerrar sesión.
function MobileAccountMenu({ modulo, irAModulo, esConsulta, onCambiarModo, onClose }) {
  const modulos = esConsulta
    ? [
        { id: "ventas", label: "Ventas", icon: ShoppingCart },
        { id: "admin", label: "Administración", icon: Settings },
        ...(MODULO_FINANZAS_ACTIVO ? [{ id: "financiero", label: "Finanzas", icon: CircleDollarSign }] : []),
      ]
    : [];
  return (
    <ModalPortal>
      <div className="sheet-backdrop" style={{ ...S.modalBackdrop, alignItems: "flex-end", padding: 0 }} onClick={onClose}>
        <div
          className="modal-card"
          style={{ ...S.modalCard, maxWidth: 480, borderRadius: "22px 22px 0 0", padding: "20px 18px calc(20px + env(safe-area-inset-bottom))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: COLORS.ink }}>Gordo Pizzería</div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 600 }}>{esConsulta ? "Administrador" : "Caja"}</div>
            </div>
            <button onClick={onClose} style={{ border: "none", background: "#F5EEE9", borderRadius: 99, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} aria-label="Cerrar menú">
              <X size={18} />
            </button>
          </div>

          {modulos.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: COLORS.muted, letterSpacing: "0.04em", textTransform: "uppercase" }}>Cambiar de módulo</div>
              {modulos.map((m) => {
                const MIcon = m.icon;
                const active = modulo === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => { irAModulo(m.id); onClose(); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 14px", borderRadius: 14, border: `1.5px solid ${active ? COLORS.red : COLORS.border}`, background: active ? COLORS.redSoft : "#fff", color: active ? COLORS.red : COLORS.ink, fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left" }}
                  >
                    <MIcon size={20} strokeWidth={2.2} />
                    <span style={{ flex: 1 }}>{m.label}</span>
                    {active && <Check size={18} />}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => { onClose(); onCambiarModo(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "15px 14px", borderRadius: 14, border: "none", background: COLORS.red, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}
          >
            <LogOut size={19} /> Cerrar sesión
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

function TopBar({ modulo, tab, cajaAbierta, caja, syncStatus, onForzarSync, esConsulta, isMobile, irAModulo, onCambiarModo }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const titles = {
    pos: "Punto de venta",
    historial: "Historial de ventas",
    inventario: "Inventario",
    caja: "Cierre de caja",
    reportes: "Reportes y ganancias",
    envivo: "En vivo",
    productos: "Productos",
    categorias: "Categorías",
    personal: "Personal",
    permisos: "Inventario y bitácora",
    alertas: "Alertas",
    ajustes: "Ajustes y respaldo",
    resumen: "Resumen financiero",
    facturas: "Facturas y gastos",
    trabajadores: "Pago a personal",
    pedidos: "Pedidos de insumos",
    proveedores: "Pago a proveedores",
  };
  const [clock, setClock] = useState(nowTime());
  useEffect(() => {
    const t = setInterval(() => setClock(nowTime()), 30000);
    return () => clearInterval(t);
  }, []);

  // Estado de sync: distinto según el rol del dispositivo
  const { online, pending, authed, lastSync } = syncStatus || {};
  let syncLabel, syncColor, syncIcon;
  if (!online) {
    syncLabel = esConsulta ? "Sin conexión" : "Sin internet";
    syncColor = "#8A756D";
    syncIcon = <CloudOff size={15} />;
  } else if (!authed) {
    syncLabel = "Conectando…";
    syncColor = "#8A756D";
    syncIcon = <Loader2 className="spin" size={15} />;
  } else if (esConsulta) {
    syncLabel = "En vivo";
    syncColor = "#2E9E5B";
    syncIcon = <Cloud size={15} />;
  } else if (pending > 0) {
    syncLabel = `${pending} por subir`;
    syncColor = "#B8860B";
    syncIcon = <RefreshCw size={15} />;
  } else {
    syncLabel = "Sincronizado";
    syncColor = "#2E9E5B";
    syncIcon = <Cloud size={15} />;
  }

  return (
    <div style={{ ...S.topbar, ...(isMobile ? S.topbarMobile : {}) }}>
      {isMobile && <Logo size={40} radius={11} style={{ marginRight: 10 }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...S.topTitle, ...(isMobile ? { fontSize: 17 } : {}) }}>{titles[tab]}</div>
        <div style={{ ...S.topSub, ...(isMobile ? { fontSize: 11.5 } : {}) }}>
          {new Date().toLocaleDateString("es-CL", isMobile
            ? { day: "numeric", month: "short" }
            : { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>
      <div style={S.topRight}>
        {tab === "pos" && !cajaAbierta && !isMobile && (
          <div style={S.warnPill}><AlertTriangle size={16} /> Abre la caja para vender</div>
        )}
        <button
          onClick={onForzarSync}
          style={{ ...S.syncPill, color: syncColor, ...(isMobile ? { padding: "7px 11px", fontSize: 11.5 } : {}) }}
          title={lastSync ? "Última sync: " + fullDateTime(lastSync) : "Sincronizar ahora"}
        >
          {syncIcon}
          <span>{syncLabel}</span>
        </button>
        {!isMobile && <div style={S.clockPill}><Clock size={15} /> {clock}</div>}
        {isMobile && (
          <button
            onClick={() => setMenuAbierto(true)}
            aria-label="Menú: cambiar módulo o cerrar sesión"
            style={{ width: 40, height: 40, borderRadius: 12, border: "1.5px solid #EBE0D8", background: "#fff", color: COLORS.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <Menu size={20} strokeWidth={2.3} />
          </button>
        )}
      </div>
      {menuAbierto && (
        <MobileAccountMenu
          modulo={modulo}
          irAModulo={irAModulo}
          esConsulta={esConsulta}
          onCambiarModo={onCambiarModo}
          onClose={() => setMenuAbierto(false)}
        />
      )}
    </div>
  );
}

function Toast({ toast }) {
  const isErr = toast.type === "error";
  return (
    <div className="toast-msg" style={{ ...S.toast, borderColor: isErr ? "#C0392B" : "#2E9E5B" }} key={toast.id}>
      {isErr ? <AlertTriangle size={18} color="#C0392B" /> : <Check size={18} color="#2E9E5B" />}
      <span>{toast.msg}</span>
    </div>
  );
}

// ============================================================
// POS — PUNTO DE VENTA
// ============================================================
// ---- Selector de método de pago (compartido entre venta nueva y cobro de pendientes) ----
// Soporta: efectivo (con cálculo de vuelto), transferencia, pendiente (opcional), y pago dividido entre efectivo+transferencia.
function MetodoPagoPicker({
  total, metodoPago, setMetodoPago,
  montoRecibido, setMontoRecibido,
  montoEfectivoMixto, setMontoEfectivoMixto,
  montoTransferenciaMixto, setMontoTransferenciaMixto,
  allowPendiente,
}) {
  const metodos = ["efectivo", "transferencia", ...(allowPendiente ? ["pendiente"] : []), "mixto"];
  const sumaMixta = (parseFloat(montoEfectivoMixto) || 0) + (parseFloat(montoTransferenciaMixto) || 0);
  const diffMixta = Math.round((total - sumaMixta) * 100) / 100;

  return (
    <>
      <div style={S.payMethods}>
        {metodos.map((m) => (
          <button
            key={m}
            onClick={() => setMetodoPago(m)}
            style={{ ...S.payBtn, ...(metodoPago === m ? (m === "pendiente" ? S.payBtnActivePendiente : S.payBtnActive) : {}) }}
          >
            {m === "efectivo" ? "💵 Efectivo" : m === "transferencia" ? "🏦 Transferencia" : m === "pendiente" ? "🕒 Pendiente por cobrar" : "➗ Pago dividido"}
          </button>
        ))}
      </div>

      {metodoPago === "pendiente" && (
        <div style={S.pendienteNote}>
          Esta venta quedará registrada como cuenta por cobrar. No se contabiliza como efectivo/transferencia hasta que la marques como pagada desde el Historial.
        </div>
      )}

      {metodoPago === "efectivo" && (
        <div style={S.vueltoBlock}>
          <MoneyInput
            placeholder="¿Con cuánto paga?"
            value={montoRecibido}
            onChange={setMontoRecibido}
            style={{ ...S.cajaInput, marginBottom: 0 }}
          />
          {montoRecibido !== "" && !isNaN(parseFloat(montoRecibido)) && (
            <div style={{ ...S.vueltoResult, color: parseFloat(montoRecibido) - total < 0 ? "#B4271A" : "#1D7A44" }}>
              {parseFloat(montoRecibido) - total < 0
                ? `Falta ${CLP(total - parseFloat(montoRecibido))}`
                : `Vuelto: ${CLP(parseFloat(montoRecibido) - total)}`}
            </div>
          )}
        </div>
      )}

      {metodoPago === "mixto" && (
        <div style={S.mixtoBlock}>
          <div style={S.mixtoRow}>
            <span style={S.mixtoLabel}>💵 Efectivo</span>
            <MoneyInput value={montoEfectivoMixto} onChange={setMontoEfectivoMixto} style={S.mixtoInput} placeholder="$ 0" />
          </div>
          <div style={S.mixtoRow}>
            <span style={S.mixtoLabel}>🏦 Transferencia</span>
            <MoneyInput value={montoTransferenciaMixto} onChange={setMontoTransferenciaMixto} style={S.mixtoInput} placeholder="$ 0" />
          </div>
          <div style={{ ...S.vueltoResult, color: diffMixta === 0 ? "#1D7A44" : "#B4271A" }}>
            {diffMixta === 0 ? "✓ Cuadra con el total" : diffMixta > 0 ? `Falta ${CLP(diffMixta)}` : `Sobran ${CLP(-diffMixta)}`}
          </div>
        </div>
      )}
    </>
  );
}

function POSView({ store, showToast, isMobile }) {
  const [cart, setCart] = useState([]); // {itemId, nombre, precio, cant, nota}
  const [category, setCategory] = useState("todos");
  const [confirming, setConfirming] = useState(false);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [processing, setProcessing] = useState(false);
  const [nombreVenta, setNombreVenta] = useState("");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [montoEfectivoMixto, setMontoEfectivoMixto] = useState("");
  const [montoTransferenciaMixto, setMontoTransferenciaMixto] = useState("");
  const [tipoVenta, setTipoVenta] = useState("cliente"); // 'cliente' | 'interno'
  const [socioInterno, setSocioInterno] = useState(store.consumoInterno[0] || "");

  // Si el destinatario seleccionado se elimina de la lista, caemos al primero disponible
  useEffect(() => {
    if (store.consumoInterno.length > 0 && !store.consumoInterno.includes(socioInterno)) {
      setSocioInterno(store.consumoInterno[0]);
    }
  }, [store.consumoInterno, socioInterno]);
  const [avisarCliente, setAvisarCliente] = useState(false);
  const [tipoEntrega, setTipoEntrega] = useState("mesa");
  const [direccion, setDireccion] = useState("");
  const [localizador, setLocalizador] = useState("");
  const [descuentoActivo, setDescuentoActivo] = useState(false);
  const [descuentoTipo, setDescuentoTipo] = useState("porcentaje"); // 'porcentaje' | 'monto'
  const [descuentoValor, setDescuentoValor] = useState("");
  const [descuentoMotivo, setDescuentoMotivo] = useState("");
  const [notasAbiertas, setNotasAbiertas] = useState(() => new Set()); // itemIds con el campo de nota visible
  const [ventaLista, setVentaLista] = useState(null); // venta recién guardada, lista para imprimir comanda
  const [printTarget, setPrintTarget] = useState("comanda"); // 'comanda' | 'recibo' — cuál de los dos tickets se está imprimiendo

  const cajaAbierta = !!store.cajaAbierta;

  const filteredItems = store.menu.filter((it) =>
    category === "todos" ? true : it.color === category
  );

  const addToCart = (item) => {
    if (!cajaAbierta) {
      showToast("Primero debes abrir la caja", "error");
      return;
    }
    // check stock feasibility for +1
    const feas = checkStock(store.insumos, [{ itemId: item.id, cant: 1 }], store.menu);
    if (!feas.ok) {
      showToast(`Sin stock suficiente: ${feas.faltante}`, "error");
      return;
    }
    setCart((prev) => {
      const ex = prev.find((c) => c.itemId === item.id);
      if (ex) return prev.map((c) => (c.itemId === item.id ? { ...c, cant: c.cant + 1 } : c));
      return [...prev, { itemId: item.id, nombre: item.nombre, precio: item.precio, cant: 1, nota: "" }];
    });
  };

  const updateNota = (itemId, value) => {
    setCart((prev) => prev.map((c) => (c.itemId === itemId ? { ...c, nota: value } : c)));
  };

  const toggleNotaAbierta = (itemId) => {
    setNotasAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const changeQty = (itemId, delta) => {
    setCart((prev) => {
      const next = prev
        .map((c) => (c.itemId === itemId ? { ...c, cant: c.cant + delta } : c))
        .filter((c) => c.cant > 0);
      return next;
    });
  };

  const removeItem = (itemId) => setCart((prev) => prev.filter((c) => c.itemId !== itemId));
  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((s, c) => s + c.precio * c.cant, 0);
  const itemCount = cart.reduce((s, c) => s + c.cant, 0);

  // Cálculo del descuento (acotado para que nunca deje el total en negativo)
  const descuentoMonto = (() => {
    if (!descuentoActivo) return 0;
    const val = parseFloat(descuentoValor) || 0;
    if (val <= 0) return 0;
    if (descuentoTipo === "porcentaje") {
      const pct = Math.min(val, 100);
      return Math.round((subtotal * pct) / 100);
    }
    return Math.min(val, subtotal);
  })();
  const total = subtotal - descuentoMonto;

  // Limpia los campos de pago (monto recibido, pago dividido) Y de descuento, para que nunca
  // quede un monto o un descuento de un intento de venta anterior pegado en la siguiente.
  const resetPagoFields = () => {
    setMontoRecibido("");
    setMontoEfectivoMixto("");
    setMontoTransferenciaMixto("");
    setDescuentoActivo(false);
    setDescuentoValor("");
    setDescuentoMotivo("");
    setDescuentoTipo("porcentaje");
  };

  const finalizeSale = async () => {
    const cartAsRecipeCheck = cart.map((c) => ({ itemId: c.itemId, cant: c.cant }));
    const feas = checkStock(store.insumos, cartAsRecipeCheck, store.menu);
    if (!feas.ok) {
      showToast(`No hay stock suficiente de: ${feas.faltante}`, "error");
      return;
    }
    if (tipoVenta === "cliente" && metodoPago === "pendiente" && !nombreVenta.trim()) {
      showToast("Ingresa el nombre del cliente para dejarla pendiente", "error");
      return;
    }
    let pagosMixtos = null;
    if (tipoVenta === "cliente" && metodoPago === "mixto") {
      const efvo = parseFloat(montoEfectivoMixto) || 0;
      const transf = parseFloat(montoTransferenciaMixto) || 0;
      if (Math.round((total - efvo - transf) * 100) !== 0) {
        showToast("El pago dividido debe sumar exactamente el total", "error");
        return;
      }
      pagosMixtos = [];
      if (efvo > 0) pagosMixtos.push({ metodo: "efectivo", monto: efvo });
      if (transf > 0) pagosMixtos.push({ metodo: "transferencia", monto: transf });
    }
    if (tipoVenta === "cliente" && avisarCliente && !localizador.trim()) {
      showToast("Ingresa el número para avisar al cliente, o desmarca la opción", "error");
      return;
    }
    if (descuentoActivo) {
      const val = parseFloat(descuentoValor) || 0;
      if (val <= 0) {
        showToast("Ingresa el valor del descuento, o desactívalo", "error");
        return;
      }
      if (!descuentoMotivo.trim()) {
        showToast("Escribe el motivo del descuento", "error");
        return;
      }
    }
    setProcessing(true);
    // descontar inventario (el producto ya salió de cocina, se pague o no en el momento)
    const nextInsumos = deductStock(store.insumos, cartAsRecipeCheck, store.menu);
    store.saveInsumos(nextInsumos);

    const esPendiente = tipoVenta === "cliente" && metodoPago === "pendiente";
    // Número de pedido correlativo que reinicia cada día. Se calcula sobre las ventas ya guardadas
    // (no sobre un contador aparte) para que nunca se desincronice, incluso trabajando sin internet.
    const hoy = todayStr();
    const numeroPedido = store.ventas
      .filter((v) => v.fecha === hoy)
      .reduce((max, v) => Math.max(max, v.numeroPedido || 0), 0) + 1;

    const venta = {
      id: uid(),
      numeroPedido,
      ts: Date.now(),
      fecha: todayStr(),
      hora: nowTime(),
      items: cart,
      subtotal,
      descuento: descuentoActivo && descuentoMonto > 0 ? {
        tipo: descuentoTipo,
        valor: parseFloat(descuentoValor) || 0,
        monto: descuentoMonto,
        motivo: descuentoMotivo.trim(),
      } : null,
      total,
      metodoPago: tipoVenta === "interno" ? "interno" : metodoPago,
      pagosMixtos,
      nombreCliente: tipoVenta === "interno" ? null : (nombreVenta.trim() || null),
      montoRecibido: tipoVenta === "cliente" && metodoPago === "efectivo" && montoRecibido !== "" ? parseFloat(montoRecibido) : null,
      tipoVenta,
      socioInterno: tipoVenta === "interno" ? socioInterno : null,
      localizador: tipoVenta === "cliente" && avisarCliente && localizador.trim() ? localizador.trim() : null,
      tipoEntrega: tipoVenta === "cliente" ? tipoEntrega : null,
      direccion: tipoVenta === "cliente" && tipoEntrega === "domicilio" && direccion.trim() ? direccion.trim() : null,
      pagadoEn: esPendiente ? null : Date.now(), // null mientras esté pendiente de cobro
      anulada: false,
      editada: false,
    };
    store.saveVentas([...store.ventas, venta]);

    setTimeout(() => {
      setProcessing(false);
      setConfirming(false);
      setVentaLista(venta);
      clearCart();
      setNombreVenta("");
      setMontoRecibido("");
      setMontoEfectivoMixto("");
      setMontoTransferenciaMixto("");
      setTipoVenta("cliente");
      setAvisarCliente(false);
      setLocalizador("");
      setTipoEntrega("mesa");
      setDireccion("");
      setDescuentoActivo(false);
      setDescuentoValor("");
      setDescuentoMotivo("");
      setDescuentoTipo("porcentaje");
      setNotasAbiertas(new Set());
      showToast(
        tipoVenta === "interno" ? "Consumo interno registrado" : esPendiente ? "Cuenta pendiente registrada" : `Venta registrada · ${CLP(total)}`
      );
    }, 350);
  };

  const lowStockItems = store.menu.filter((it) => !checkStock(store.insumos, [{ itemId: it.id, cant: 1 }], store.menu).ok);

  return (
    <div style={{ ...S.posGrid, ...(isMobile ? S.posGridMobile : {}) }}>
      <div style={S.posLeft}>
        <div className="cat-row" style={{ ...S.catRow, ...(isMobile ? S.catRowMobile : {}) }}>
          {[{ id: "todos", nombre: "Todo" }, ...store.categorias].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              style={{ ...S.catBtn, ...(category === c.id ? S.catBtnActive : {}) }}
            >
              {c.nombre}
            </button>
          ))}
        </div>
        <div className="items-grid" style={S.itemsGrid}>
          {filteredItems.map((item) => {
            const feas = checkStock(store.insumos, [{ itemId: item.id, cant: 1 }], store.menu);
            return (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                disabled={!feas.ok}
                style={{ ...S.menuCard, ...(feas.ok ? {} : S.menuCardDisabled) }}
              >
                <div style={S.menuCardTop}>
                  <span style={S.menuCardBadge(item.color)}>
                    {(() => { const cat = store.categorias.find((c) => c.id === item.color); return <span>{cat ? cat.icono : "🍽️"}</span>; })()}
                  </span>
                  {!feas.ok && <span style={S.outStockTag}>Sin stock</span>}
                </div>
                <div style={S.menuCardName}>{item.nombre}</div>
                <div style={S.menuCardDesc}>{item.desc}</div>
                <div style={S.menuCardFooter}>
                  <span style={S.menuCardPrice}>{CLP(item.precio)}</span>
                  <span style={S.menuCardAdd}><Plus size={18} strokeWidth={2.6} /></span>
                </div>
              </button>
            );
          })}
        </div>
        {lowStockItems.length > 0 && (
          <div style={S.stockWarnBar}>
            <AlertTriangle size={15} color="#B4443B" />
            {lowStockItems.length} producto(s) sin stock suficiente para vender
          </div>
        )}
      </div>

      <div style={{ ...S.posRight, ...(isMobile ? S.posRightMobile : {}) }}>
        <div style={S.cartHeader}>
          <div style={S.cartTitle}><ReceiptText size={19} /> Pedido actual</div>
          {cart.length > 0 && (
            <button onClick={clearCart} style={S.cartClearBtn}><Trash2 size={15} /></button>
          )}
        </div>

        <div style={S.cartList}>
          {cart.length === 0 ? (
            <div style={S.cartEmpty}>
              <ShoppingCart size={36} color="#D8CFC9" />
              <span>Toca un producto para agregarlo</span>
            </div>
          ) : (
            cart.map((c) => (
              <div key={c.itemId} style={S.cartItemBlock}>
                <div style={S.cartRow}>
                  <div style={S.cartRowInfo}>
                    <div style={S.cartRowName}>{c.nombre}</div>
                    <div style={S.cartRowPrice}>{CLP(c.precio)} c/u</div>
                  </div>
                  <div style={S.qtyControls}>
                    <button onClick={() => changeQty(c.itemId, -1)} style={S.qtyBtn}><Minus size={15} /></button>
                    <span style={S.qtyNum}>{c.cant}</span>
                    <button onClick={() => changeQty(c.itemId, 1)} style={S.qtyBtn}><Plus size={15} /></button>
                  </div>
                  <button onClick={() => removeItem(c.itemId)} style={S.cartRowDel}><X size={15} /></button>
                </div>
                {notasAbiertas.has(c.itemId) || c.nota ? (
                  <input
                    type="text"
                    autoFocus={notasAbiertas.has(c.itemId) && !c.nota}
                    value={c.nota}
                    onChange={(e) => updateNota(c.itemId, e.target.value)}
                    placeholder="Nota para cocina (ej: sin cebolla)"
                    style={S.cartNotaInput}
                  />
                ) : (
                  <button onClick={() => toggleNotaAbierta(c.itemId)} style={S.cartNotaToggle}>
                    <MessageSquare size={13} /> Agregar nota
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div style={S.cartSummary}>
          <div style={S.cartTotalRow}>
            <span>Total ({itemCount} {itemCount === 1 ? "ítem" : "ítems"})</span>
            <span style={S.cartTotalNum}>{CLP(total)}</span>
          </div>
          <button
            disabled={cart.length === 0 || !cajaAbierta}
            onClick={() => { resetPagoFields(); setConfirming(true); }}
            style={{
              ...S.chargeBtn,
              ...(cart.length === 0 || !cajaAbierta ? S.chargeBtnDisabled : {}),
            }}
          >
            Cobrar {cart.length > 0 ? CLP(total) : ""}
          </button>
        </div>
      </div>

      {confirming && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => { if (!processing) { setConfirming(false); resetPagoFields(); } }}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Confirmar venta</div>
            {descuentoMonto > 0 ? (
              <div style={{ textAlign: "center" }}>
                <span style={S.modalTotalTachado}>{CLP(subtotal)}</span>
                <div style={S.modalTotal}>{CLP(total)}</div>
                <div style={S.modalDescBadge}>Descuento {CLP(descuentoMonto)}</div>
              </div>
            ) : (
              <div style={S.modalTotal}>{CLP(total)}</div>
            )}

            <div style={S.tipoVentaRow}>
              <button
                onClick={() => setTipoVenta("cliente")}
                style={{ ...S.tipoVentaBtn, ...(tipoVenta === "cliente" ? S.tipoVentaBtnActive : {}) }}
              >
                Venta a cliente
              </button>
              <button
                onClick={() => setTipoVenta("interno")}
                style={{ ...S.tipoVentaBtn, ...(tipoVenta === "interno" ? S.tipoVentaBtnActiveInterno : {}) }}
              >
                Consumo interno
              </button>
            </div>

            {tipoVenta === "cliente" ? (
              <>
                <div style={S.entregaLabel}>Tipo de entrega</div>
                <div style={S.entregaRow}>
                  {TIPOS_ENTREGA.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTipoEntrega(t)}
                      style={{ ...S.entregaBtn, ...(tipoEntrega === t ? S.entregaBtnActive : {}) }}
                    >
                      {tipoEntrega === t && <span style={S.entregaCheck}>✓</span>}
                      <span style={{ fontSize: 22 }}>{t === "domicilio" ? "🛵" : t === "recogen" ? "🥡" : "🍽️"}</span>
                      <span>{LABEL_ENTREGA[t]}</span>
                    </button>
                  ))}
                </div>
                {tipoEntrega === "domicilio" && (
                  <input
                    type="text"
                    placeholder="Dirección de entrega (calle, número, referencia)"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    style={{ ...S.cajaInput, textAlign: "left", marginBottom: 10, fontWeight: 600, fontSize: 14.5, borderColor: COLORS.red }}
                  />
                )}

                <input
                  type="text"
                  placeholder={metodoPago === "pendiente" ? "Nombre del cliente (obligatorio)" : "Nombre del cliente (opcional)"}
                  value={nombreVenta}
                  onChange={(e) => setNombreVenta(e.target.value)}
                  style={{ ...S.cajaInput, textAlign: "left", marginBottom: 16, fontWeight: 600, fontSize: 14.5 }}
                />

                <MetodoPagoPicker
                  total={total}
                  metodoPago={metodoPago}
                  setMetodoPago={setMetodoPago}
                  montoRecibido={montoRecibido}
                  setMontoRecibido={setMontoRecibido}
                  montoEfectivoMixto={montoEfectivoMixto}
                  setMontoEfectivoMixto={setMontoEfectivoMixto}
                  montoTransferenciaMixto={montoTransferenciaMixto}
                  setMontoTransferenciaMixto={setMontoTransferenciaMixto}
                  allowPendiente={true}
                />

                <div style={S.avisarBlock}>
                  <label style={S.avisarCheckboxRow}>
                    <input type="checkbox" checked={avisarCliente} onChange={(e) => setAvisarCliente(e.target.checked)} style={S.checkbox} />
                    <span>Avisar al cliente cuando esté listo</span>
                  </label>
                  {avisarCliente && (
                    <input
                      type="tel"
                      placeholder="Número para llamar (ej: 300 123 4567)"
                      value={localizador}
                      onChange={(e) => setLocalizador(e.target.value)}
                      style={{ ...S.cajaInput, textAlign: "left", marginTop: 8, fontWeight: 600, fontSize: 14.5 }}
                    />
                  )}
                </div>

                <div style={S.descuentoBlock}>
                  <label style={S.avisarCheckboxRow}>
                    <input type="checkbox" checked={descuentoActivo} onChange={(e) => setDescuentoActivo(e.target.checked)} style={S.checkbox} />
                    <span>Aplicar descuento</span>
                  </label>
                  {descuentoActivo && (
                    <div style={{ marginTop: 10 }}>
                      <div style={S.descTipoRow}>
                        <button
                          onClick={() => setDescuentoTipo("porcentaje")}
                          style={{ ...S.descTipoBtn, ...(descuentoTipo === "porcentaje" ? S.descTipoActive : {}) }}
                        >% Porcentaje</button>
                        <button
                          onClick={() => setDescuentoTipo("monto")}
                          style={{ ...S.descTipoBtn, ...(descuentoTipo === "monto" ? S.descTipoActive : {}) }}
                        >$ Monto fijo</button>
                      </div>
                      {descuentoTipo === "porcentaje" ? (
                        <input
                          type="number"
                          placeholder="Ej: 10 (%)"
                          value={descuentoValor}
                          onChange={(e) => setDescuentoValor(e.target.value)}
                          style={{ ...S.cajaInput, textAlign: "left", marginTop: 8, fontWeight: 600, fontSize: 14.5 }}
                        />
                      ) : (
                        <MoneyInput
                          placeholder="Ej: $ 2.000"
                          value={descuentoValor}
                          onChange={setDescuentoValor}
                          style={{ ...S.cajaInput, textAlign: "left", marginTop: 8, fontWeight: 600, fontSize: 14.5 }}
                        />
                      )}
                      <input
                        type="text"
                        placeholder="Motivo del descuento (obligatorio)"
                        value={descuentoMotivo}
                        onChange={(e) => setDescuentoMotivo(e.target.value)}
                        style={{ ...S.cajaInput, textAlign: "left", marginTop: 8, fontWeight: 600, fontSize: 14.5 }}
                      />
                      {descuentoMonto > 0 && (
                        <div style={S.descResumen}>
                          <span>Subtotal {CLP(subtotal)}</span>
                          <span style={{ color: "#B4271A" }}>− {CLP(descuentoMonto)}</span>
                          <span style={{ fontWeight: 900 }}>Total {CLP(total)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={S.socioBlock}>
                <div style={S.socioLabel}>¿Para quién es el consumo?</div>
                <div style={S.socioRow}>
                  {store.consumoInterno.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSocioInterno(s)}
                      style={{ ...S.socioBtn, ...(socioInterno === s ? S.socioBtnActive : {}) }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div style={S.socioNote}>No se contabiliza como ingreso ni afecta la caja. Sí descuenta del inventario.</div>
              </div>
            )}

            <div style={S.modalActions}>
              <button onClick={() => { setConfirming(false); resetPagoFields(); }} disabled={processing} style={S.modalCancel}>Cancelar</button>
              <button onClick={finalizeSale} disabled={processing} style={S.modalConfirm}>
                {processing ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                {processing
                  ? "Procesando…"
                  : tipoVenta === "interno"
                    ? "Confirmar consumo"
                    : metodoPago === "pendiente"
                      ? "Dejar pendiente"
                      : "Confirmar cobro"}
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      {ventaLista && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setVentaLista(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.ventaOkIcon}><Check size={26} color="#fff" /></div>
            <div style={{ ...S.modalTitle, marginTop: 14 }}>
              {ventaLista.tipoVenta === "interno" ? "Consumo registrado" : ventaLista.metodoPago === "pendiente" ? "Cuenta pendiente registrada" : "Venta registrada"}
            </div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              {ventaLista.tipoVenta === "interno"
                ? `Consumo interno · ${ventaLista.socioInterno}`
                : ventaLista.metodoPago === "pendiente"
                  ? `${ventaLista.nombreCliente} debe ${CLP(ventaLista.total)}`
                  : (ventaLista.nombreCliente || "Venta sin nombre")}
            </div>
            {ventaLista.numeroPedido != null && (
              <div style={S.numeroPedidoBox}>
                {ventaLista.tipoEntrega && (
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#3A5FA0", marginBottom: 4 }}>
                    {LABEL_ENTREGA[ventaLista.tipoEntrega]}
                  </div>
                )}
                {ventaLista.direccion && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 4 }}>📍 {ventaLista.direccion}</div>
                )}
                <div style={S.numeroPedidoLabel}>N° de seguimiento</div>
                <div style={S.numeroPedidoValor}>{ventaLista.numeroPedido}</div>
              </div>
            )}
            <div style={S.modalActions}>
              <button onClick={() => setVentaLista(null)} style={S.modalCancel}>Cerrar</button>
              {ventaLista.tipoVenta !== "interno" ? (
                <button onClick={() => { setPrintTarget("ambos"); printAmbos(ventaLista); }} style={S.printBtnAmbos}>
                  🖨️ Imprimir comanda y recibo
                </button>
              ) : (
                <button onClick={() => { setPrintTarget("comanda"); printComanda(ventaLista); }} style={S.printBtnAmbos}>
                  🖨️ Imprimir comanda
                </button>
              )}
            </div>
            {ventaLista.tipoVenta !== "interno" && (
              <div style={S.printOnlyRow}>
                <button onClick={() => { setPrintTarget("comanda"); printComanda(ventaLista); }} style={S.printOnlyBtn}>Solo comanda</button>
                <button onClick={() => { setPrintTarget("recibo"); printRecibo(ventaLista); }} style={S.printOnlyBtn}>Solo recibo</button>
              </div>
            )}
          </div>
        </div></ModalPortal>
      )}
      <ComandaPrintArea venta={printTarget === "comanda" ? ventaLista : null} />
      <ReciboPrintArea venta={printTarget === "recibo" ? ventaLista : null} />
      <TicketsPrintPortal venta={printTarget === "ambos" ? ventaLista : null} />
    </div>
  );
}

// ---- Comanda (ticket de cocina) ----
// Imprime comanda + recibo con UN solo comando: dos tickets, uno por página (la térmica corta entre uno y otro).
// Los dos tickets se dibujan en un contenedor aparte (TicketsPrintPortal) para que el navegador los pagine bien.
function printAmbos(venta) {
  if (!venta) return;
  document.body.classList.add("printing-tickets");
  const limpiar = () => document.body.classList.remove("printing-tickets");
  window.addEventListener("afterprint", limpiar, { once: true });
  setTimeout(() => {
    try { window.print(); } catch (e) { console.error("Error al imprimir comanda y recibo", e); limpiar(); }
  }, 80);
}

function TicketsPrintPortal({ venta }) {
  if (!venta || typeof document === "undefined") return null;
  return createPortal(
    <div id="tickets-print-root">
      <ComandaPrintArea venta={venta} />
      {venta.tipoVenta !== "interno" && <ReciboPrintArea venta={venta} />}
    </div>,
    document.body
  );
}

function printComanda(venta) {
  if (!venta) return;
  document.body.classList.remove("printing-tickets");
  // Pequeño delay para asegurar que el área de impresión ya tiene los datos en el DOM.
  // Envolvemos con try-catch para que si el navegador falla al imprimir, la app no se bloquee.
  setTimeout(() => {
    try { window.print(); } catch (e) { console.error("Error al imprimir comanda", e); }
  }, 50);
}

function ComandaPrintArea({ venta }) {
  if (!venta) return null;
  const esInterno = venta.tipoVenta === "interno";
  return (
    <div id="comanda-print-area" style={{ display: "none" }}>
      <div style={{ fontFamily: "'Courier New', monospace", width: "280px", padding: "10px", color: "#000" }}>
        {/* Espacio en blanco para que la comandera/soporte no tape el encabezado */}
        <div style={{ height: "22mm" }} />
        <div style={{ textAlign: "center", fontWeight: 900, fontSize: 20, letterSpacing: 1 }}>GORDO PIZZERÍA</div>
        <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, marginTop: 2 }}>
          {venta.esComandaAdicional ? "COMANDA ADICIONAL" : "COMANDA COCINA"}
        </div>
        {venta.esComandaAdicional && (
          <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, marginTop: 2, fontStyle: "italic" }}>
            (agregado a pedido existente)
          </div>
        )}
        {venta.tipoEntrega && (
          <div style={{ textAlign: "center", border: "4px double #000", borderRadius: 6, padding: "10px 4px", margin: "10px 0" }}>
            <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1.1, letterSpacing: 2, color: "#000" }}>
              {LABEL_ENTREGA[venta.tipoEntrega] || venta.tipoEntrega}
            </div>
          </div>
        )}
        {venta.tipoEntrega === "domicilio" && venta.direccion && (
          <div style={{ border: "3px solid #000", borderRadius: 6, padding: "8px 6px", margin: "10px 0", textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>DIRECCIÓN</div>
            <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.2, color: "#000" }}>{venta.direccion}</div>
          </div>
        )}
        {venta.numeroPedido != null && (
          <div style={{ textAlign: "center", border: "3px solid #000", borderRadius: 6, padding: "6px 4px", margin: "10px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>NÚMERO DE SEGUIMIENTO</div>
            <div style={{ fontSize: 54, fontWeight: 900, lineHeight: 1 }}>{venta.numeroPedido}</div>
          </div>
        )}
        <div style={{ borderTop: "2px dashed #000", margin: "10px 0" }} />
        <div style={{ fontSize: 20, fontWeight: 800, textAlign: "center" }}>{venta.fecha} · {venta.hora}</div>
        <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, textAlign: "center" }}>
          {esInterno ? `INTERNO — ${venta.socioInterno}` : (venta.nombreCliente || "Cliente sin nombre")}
        </div>
        {venta.localizador && (
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 8, border: "3px solid #000", padding: "8px 6px", textAlign: "center" }}>
            📞 LLAMAR: {venta.localizador}
          </div>
        )}
        <div style={{ borderTop: "2px dashed #000", margin: "10px 0" }} />
        {venta.items.map((it) => (
          <div key={it.itemId} style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, fontWeight: 900, lineHeight: 1.25 }}>
              <span style={{ marginRight: 10 }}>{it.cant}×</span>
              <span style={{ flex: 1 }}>{it.nombre}</span>
            </div>
            {it.nota && it.nota.trim() && (
              <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2, marginTop: 2, paddingLeft: 4 }}>
                » {it.nota.trim().toUpperCase()}
              </div>
            )}
          </div>
        ))}
        <div style={{ borderTop: "2px dashed #000", margin: "10px 0" }} />
        {esInterno ? (
          <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800 }}>NO FACTURAR · CONSUMO INTERNO</div>
        ) : venta.metodoPago === "pendiente" ? (
          <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800 }}>PAGO PENDIENTE POR COBRAR</div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700 }}>Pago: {labelMetodoPago(venta)}</div>
        )}
        <div style={{ textAlign: "center", fontSize: 10, marginTop: 8, color: "#333" }}>#{venta.id.slice(-6).toUpperCase()}</div>
      </div>
    </div>
  );
}

// ---- Recibo para el cliente ----
function printRecibo(venta) {
  if (!venta) return;
  document.body.classList.remove("printing-tickets");
  setTimeout(() => {
    try { window.print(); } catch (e) { console.error("Error al imprimir recibo", e); }
  }, 50);
}

function ReciboPrintArea({ venta }) {
  if (!venta) return null;
  const cantTotal = venta.items.reduce((s, it) => s + it.cant, 0);
  // Letra grande y en negrita (Arial se imprime más firme que Courier en la térmica)
  const fila = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 };
  return (
    <div id="recibo-print-area" style={{ display: "none" }}>
      <div style={{ fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, width: "280px", padding: "10px", color: "#000" }}>
        <div style={{ height: "22mm" }} />
        <div style={{ textAlign: "center", fontWeight: 900, fontSize: 25, letterSpacing: 0.5 }}>GORDO PIZZERÍA</div>
        <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, marginTop: 2 }}>Pizza artesanal</div>
        <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, marginTop: 6 }}>RECIBO</div>
        {venta.numeroPedido != null && (
          <div style={{ textAlign: "center", fontSize: 34, fontWeight: 900, marginTop: 4 }}>
            PEDIDO {venta.numeroPedido}
          </div>
        )}
        <div style={{ borderTop: "3px dashed #000", margin: "10px 0" }} />
        <div style={{ fontSize: 15, fontWeight: 800 }}>{venta.fecha} · {venta.hora}</div>
        <div style={{ borderTop: "2px dashed #000", margin: "10px 0" }} />
        {venta.items.map((it) => (
          <div key={it.itemId} style={{ marginBottom: 9 }}>
            <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.2 }}>{it.nombre}</div>
            <div style={{ ...fila, fontSize: 16, fontWeight: 700 }}>
              <span>{it.cant} × {CLP(it.precio)}</span>
              <span>{CLP(it.precio * it.cant)}</span>
            </div>
            {it.nota && it.nota.trim() && (
              <div style={{ fontSize: 15, fontWeight: 700, fontStyle: "italic" }}>({it.nota.trim()})</div>
            )}
          </div>
        ))}
        <div style={{ borderTop: "3px dashed #000", margin: "10px 0" }} />
        <div style={{ ...fila, fontSize: 16, fontWeight: 800 }}>
          <span>Ítems</span>
          <span>{cantTotal}</span>
        </div>
        {venta.descuento && (
          <>
            <div style={{ ...fila, fontSize: 16, fontWeight: 800, marginTop: 4 }}>
              <span>Subtotal</span>
              <span>{CLP(venta.subtotal || venta.total + venta.descuento.monto)}</span>
            </div>
            <div style={{ ...fila, fontSize: 16, fontWeight: 800, marginTop: 2 }}>
              <span>Descuento {venta.descuento.tipo === "porcentaje" ? `(${venta.descuento.valor}%)` : ""}</span>
              <span>− {CLP(venta.descuento.monto)}</span>
            </div>
          </>
        )}
        <div style={{ ...fila, fontSize: 26, fontWeight: 900, marginTop: 8 }}>
          <span>TOTAL</span>
          <span>{CLP(venta.total)}</span>
        </div>
        <div style={{ borderTop: "2px dashed #000", margin: "10px 0" }} />
        {venta.metodoPago === "pendiente" ? (
          <div style={{ textAlign: "center", fontSize: 16, fontWeight: 900 }}>PAGO PENDIENTE POR COBRAR</div>
        ) : (
          <>
            <div style={{ textAlign: "center", fontSize: 17, fontWeight: 800 }}>Pago: {labelMetodoPago(venta)}</div>
            {venta.metodoPago === "efectivo" && venta.montoRecibido != null && (
              <>
                <div style={{ ...fila, fontSize: 16, fontWeight: 700, marginTop: 6 }}>
                  <span>Recibido</span>
                  <span>{CLP(venta.montoRecibido)}</span>
                </div>
                <div style={{ ...fila, fontSize: 16, fontWeight: 700 }}>
                  <span>Vuelto</span>
                  <span>{CLP(venta.montoRecibido - venta.total)}</span>
                </div>
              </>
            )}
          </>
        )}
        <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, marginTop: 14 }}>¡Gracias por tu compra!</div>
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, marginTop: 8 }}>#{venta.id.slice(-6).toUpperCase()}</div>
      </div>
    </div>
  );
}

// ---- Helpers de stock (recetas) ----
function checkStock(insumos, cartItems, menu = MENU_INICIAL) {
  const need = {};
  for (const ci of cartItems) {
    const menuItem = menu.find((m) => m.id === ci.itemId);
    if (!menuItem) continue;
    for (const r of menuItem.recipe) {
      need[r.insumoId] = (need[r.insumoId] || 0) + r.cant * ci.cant;
    }
  }
  let faltanteNames = [];
  for (const [insumoId, cantNeeded] of Object.entries(need)) {
    const ins = insumos.find((i) => i.id === insumoId);
    if (!ins || ins.activo === false || ins.stock < cantNeeded) {
      faltanteNames.push(ins ? ins.nombre : insumoId);
    }
  }
  return { ok: faltanteNames.length === 0, faltante: faltanteNames.join(", ") };
}

function deductStock(insumos, cartItems, menu = MENU_INICIAL) {
  const need = {};
  for (const ci of cartItems) {
    const menuItem = menu.find((m) => m.id === ci.itemId);
    if (!menuItem) continue;
    for (const r of menuItem.recipe) {
      need[r.insumoId] = (need[r.insumoId] || 0) + r.cant * ci.cant;
    }
  }
  return insumos.map((ins) =>
    need[ins.id] ? { ...ins, stock: Math.max(0, ins.stock - need[ins.id]) } : ins
  );
}

// ============================================================
// INVENTARIO
// ============================================================
// ============================================================
// HISTORIAL DE VENTAS
// ============================================================
function HistorialView({ store, showToast, isMobile }) {
  const [selected, setSelected] = useState(null); // venta seleccionada para ver detalle
  const [printTarget, setPrintTarget] = useState("comanda"); // 'comanda' | 'recibo' — cuál ticket se reimprime
  const [editingSale, setEditingSale] = useState(null); // venta en modo edición {..., items: [...]}
  const [confirmAnular, setConfirmAnular] = useState(null);
  const [motivoAnul, setMotivoAnul] = useState("");
  const [anularAdmin, setAnularAdmin] = useState(null); // admin: venta que se quiere anular (orden a la caja)
  const [corrigiendo, setCorrigiendo] = useState(null); // admin: {venta, nombreCliente, tipoEntrega, direccion, metodoPago}
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState("todas"); // todas | activas | anuladas
  const [busqueda, setBusqueda] = useState("");
  const [cobrandoPendiente, setCobrandoPendiente] = useState(false);
  const [metodoCobro, setMetodoCobro] = useState("efectivo");
  const [montoRecibidoCobro, setMontoRecibidoCobro] = useState("");
  const [montoEfectivoMixtoCobro, setMontoEfectivoMixtoCobro] = useState("");
  const [montoTransferenciaMixtoCobro, setMontoTransferenciaMixtoCobro] = useState("");
  const [descCobroActivo, setDescCobroActivo] = useState(false);
  const [descCobroTipo, setDescCobroTipo] = useState("porcentaje");
  const [descCobroValor, setDescCobroValor] = useState("");
  const [descCobroMotivo, setDescCobroMotivo] = useState("");
  const [comandaAdicional, setComandaAdicional] = useState(null); // venta con solo los items nuevos, tras agregar productos
  const [agrupacion, setAgrupacion] = useState("dia"); // 'dia' | 'turno'
  const [resumenAbierto, setResumenAbierto] = useState(() => new Set());

  const toggleResumen = (clave) => {
    setResumenAbierto((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  };

  // Limpia TODOS los campos del cobro (monto recibido, pago dividido, descuento).
  // Se usa cada vez que se abre un cobro nuevo o se sale de uno sin confirmar, para que
  // nunca quede un monto o descuento de una cuenta anterior pegado en la siguiente.
  const resetCobroFields = () => {
    setMetodoCobro("efectivo");
    setMontoRecibidoCobro("");
    setMontoEfectivoMixtoCobro("");
    setMontoTransferenciaMixtoCobro("");
    setDescCobroActivo(false);
    setDescCobroValor("");
    setDescCobroMotivo("");
    setDescCobroTipo("porcentaje");
  };

  const ventasOrdenadas = [...store.ventas].sort((a, b) => b.ts - a.ts);

  const filtradas = ventasOrdenadas.filter((v) => {
    if (filtro === "activas" && v.anulada) return false;
    if (filtro === "anuladas" && !v.anulada) return false;
    if (filtro === "interno" && v.tipoVenta !== "interno") return false;
    if (filtro === "pendientes" && !(v.metodoPago === "pendiente" && !v.anulada)) return false;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      const matchNombre = (v.nombreCliente || "").toLowerCase().includes(q);
      // Permite buscar "12" o "#12" para encontrar el pedido por su número
      const matchNumero = String(v.numeroPedido || "") === q.replace(/^#/, "");
      const matchItems = v.items.some((it) => it.nombre.toLowerCase().includes(q));
      if (!matchNombre && !matchItems && !matchNumero) return false;
    }
    return true;
  });

  const pendientes = store.ventas.filter((v) => v.metodoPago === "pendiente" && !v.anulada);
  const totalPendiente = pendientes.reduce((s, v) => s + v.total, 0);

  const anularVenta = (venta) => {
    if (!motivoAnul.trim()) { showToast("Escribe el motivo de la anulación", "error"); return; }
    // Revertir el inventario que se había descontado
    const cartAsRecipe = venta.items.map((it) => ({ itemId: it.itemId, cant: it.cant }));
    const nextInsumos = restoreStock(store.insumos, cartAsRecipe, store.menu);
    store.saveInsumos(nextInsumos);

    const nextVentas = store.ventas.map((v) =>
      v.id === venta.id ? { ...v, anulada: true, anuladaTs: Date.now(), anuladaPor: (store.cajaAbierta && store.cajaAbierta.cajero) || "caja", motivoAnulacion: motivoAnul.trim() } : v
    );
    store.saveVentas(nextVentas);
    setMotivoAnul("");
    setConfirmAnular(null);
    setSelected(null);
    showToast("Venta anulada · inventario restituido");
  };

  // Calcula el descuento sobre una cuenta pendiente que se está por cobrar
  const calcDescCobro = (venta) => {
    if (!descCobroActivo || !venta) return 0;
    const base = venta.subtotal || venta.total; // sobre el valor original de la cuenta
    const val = parseFloat(descCobroValor) || 0;
    if (val <= 0) return 0;
    if (descCobroTipo === "porcentaje") return Math.round((base * Math.min(val, 100)) / 100);
    return Math.min(val, base);
  };

  const cobrarPendiente = (venta, metodo, montoRecibidoCobro, pagosMixtosCobro, totalFinal, descuentoData) => {
    const nextVentas = store.ventas.map((v) =>
      v.id === venta.id
        ? {
            ...v,
            metodoPago: metodo,
            pagosMixtos: metodo === "mixto" ? pagosMixtosCobro : null,
            montoRecibido: metodo === "efectivo" && montoRecibidoCobro !== "" ? parseFloat(montoRecibidoCobro) : null,
            subtotal: descuentoData ? (v.subtotal || v.total) : v.subtotal,
            descuento: descuentoData || v.descuento || null,
            total: totalFinal,
            pagadoEn: Date.now(),
          }
        : v
    );
    store.saveVentas(nextVentas);
    setSelected(null);
    setCobrandoPendiente(false);
    resetCobroFields();
    showToast(`Cuenta de ${venta.nombreCliente} marcada como pagada`);
  };

  const confirmarCobroPendiente = () => {
    // Validar y armar el descuento si está activo
    let descuentoData = null;
    const descMonto = calcDescCobro(selected);
    if (descCobroActivo) {
      const val = parseFloat(descCobroValor) || 0;
      if (val <= 0) { showToast("Ingresa el valor del descuento, o desactívalo", "error"); return; }
      if (!descCobroMotivo.trim()) { showToast("Escribe el motivo del descuento", "error"); return; }
      descuentoData = {
        tipo: descCobroTipo,
        valor: val,
        monto: descMonto,
        motivo: descCobroMotivo.trim(),
      };
    }
    const totalFinal = (selected.subtotal || selected.total) - descMonto;

    if (metodoCobro === "mixto") {
      const efvo = parseFloat(montoEfectivoMixtoCobro) || 0;
      const transf = parseFloat(montoTransferenciaMixtoCobro) || 0;
      if (Math.round((totalFinal - efvo - transf) * 100) !== 0) {
        showToast("El pago dividido debe sumar exactamente el total", "error");
        return;
      }
      const pagosMixtosCobro = [];
      if (efvo > 0) pagosMixtosCobro.push({ metodo: "efectivo", monto: efvo });
      if (transf > 0) pagosMixtosCobro.push({ metodo: "transferencia", monto: transf });
      cobrarPendiente(selected, "mixto", null, pagosMixtosCobro, totalFinal, descuentoData);
    } else {
      cobrarPendiente(selected, metodoCobro, montoRecibidoCobro, null, totalFinal, descuentoData);
    }
  };

  const guardarEdicion = (ventaEditada) => {
    const original = store.ventas.find((v) => v.id === ventaEditada.id);
    // calcular diferencia de insumos: primero devolver los originales, luego descontar los nuevos
    const cartOriginal = original.items.map((it) => ({ itemId: it.itemId, cant: it.cant }));
    const cartNuevo = ventaEditada.items.map((it) => ({ itemId: it.itemId, cant: it.cant }));

    const feas = checkStockDelta(store.insumos, cartOriginal, cartNuevo, store.menu);
    if (!feas.ok) {
      showToast(`No hay stock suficiente para el cambio: ${feas.faltante}`, "error");
      return false;
    }

    let nextInsumos = restoreStock(store.insumos, cartOriginal, store.menu);
    nextInsumos = deductStock(nextInsumos, cartNuevo, store.menu);
    store.saveInsumos(nextInsumos);

    const nuevoSubtotal = ventaEditada.items.reduce((s, it) => s + it.precio * it.cant, 0);
    // Si la cuenta ya tenía un descuento (aplicado al crearla), hay que recalcularlo sobre
    // el nuevo subtotal para no perderlo ni dejarlo desactualizado al agregar productos.
    let descuentoRecalculado = original.descuento || null;
    if (descuentoRecalculado) {
      const montoRecalc = descuentoRecalculado.tipo === "porcentaje"
        ? Math.round((nuevoSubtotal * Math.min(descuentoRecalculado.valor, 100)) / 100)
        : Math.min(descuentoRecalculado.valor, nuevoSubtotal);
      descuentoRecalculado = { ...descuentoRecalculado, monto: montoRecalc };
    }
    const nuevoTotal = nuevoSubtotal - (descuentoRecalculado ? descuentoRecalculado.monto : 0);
    // Detectar productos/unidades AÑADIDAS que no existían antes o cuya cantidad subió
    const itemsAgregados = [];
    for (const nuevo of ventaEditada.items) {
      const antes = original.items.find((o) => o.itemId === nuevo.itemId);
      const cantAntes = antes ? antes.cant : 0;
      const delta = nuevo.cant - cantAntes;
      if (delta > 0) {
        itemsAgregados.push({ ...nuevo, cant: delta });
      }
    }

    const ventaActualizada = { ...ventaEditada, subtotal: nuevoSubtotal, descuento: descuentoRecalculado, total: nuevoTotal, editada: true, editadaTs: Date.now() };
    const nextVentas = store.ventas.map((v) => (v.id === ventaEditada.id ? ventaActualizada : v));
    store.saveVentas(nextVentas);
    setEditingSale(null);
    // Siempre reflejar la venta actualizada en pantalla (con su subtotal/descuento/total recalculados),
    // se hayan agregado productos nuevos o no. Dejar "selected" apuntando a la versión vieja es lo que
    // permitía cobrar contra un total desactualizado si el cajero no cerraba y reabría la cuenta.
    setSelected(ventaActualizada);

    if (itemsAgregados.length > 0) {
      // Preparar comanda adicional con solo lo nuevo
      setComandaAdicional({ ...ventaActualizada, items: itemsAgregados, esComandaAdicional: true });
    }
    setCobrandoPendiente(false);
    showToast("Venta actualizada");
    return true;
  };

  const totalFiltradas = filtradas.filter((v) => !v.anulada).reduce((s, v) => s + v.total, 0);

  // Etiqueta amigable para una fecha: "Hoy", "Ayer" o la fecha escrita
  const etiquetaFecha = (fechaKey) => {
    const hoy = todayStr();
    const ayer = localDateStr(new Date(Date.now() - 86400000));
    if (fechaKey === hoy) return "Hoy";
    if (fechaKey === ayer) return "Ayer";
    const [y, m, d] = fechaKey.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  };

  // Agrupar las ventas filtradas por día o por turno de caja
  const grupos = useMemo(() => {
    const mapa = new Map();

    const agregar = (clave, meta, venta) => {
      if (!mapa.has(clave)) mapa.set(clave, { clave, ...meta, ventas: [] });
      mapa.get(clave).ventas.push(venta);
    };

    for (const v of filtradas) {
      if (agrupacion === "dia") {
        const key = localDateStr(new Date(v.ts));
        agregar(key, { titulo: etiquetaFecha(key), orden: v.ts, subtitulo: null }, v);
      } else {
        // Buscar a qué turno cerrado pertenece esta venta
        const cierre = store.cierres.find((c) => v.ts >= c.abiertaTs && v.ts <= c.cerradaTs);
        if (cierre) {
          agregar(`t_${cierre.id}`, {
            titulo: `Turno del ${etiquetaFecha(localDateStr(new Date(cierre.abiertaTs)))}`,
            subtitulo: `${new Date(cierre.abiertaTs).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} → ${new Date(cierre.cerradaTs).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} · cerrado`,
            orden: cierre.abiertaTs,
          }, v);
        } else if (store.cajaAbierta && v.ts >= store.cajaAbierta.abiertaTs) {
          agregar("t_actual", {
            titulo: "Turno en curso",
            subtitulo: `Abierto a las ${new Date(store.cajaAbierta.abiertaTs).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`,
            orden: store.cajaAbierta.abiertaTs,
          }, v);
        } else {
          agregar("t_sin", { titulo: "Sin turno asignado", subtitulo: "Ventas fuera de un turno de caja", orden: 0 }, v);
        }
      }
    }

    return [...mapa.values()]
      .map((g) => {
        const validas = g.ventas.filter((v) => !v.anulada && v.tipoVenta !== "interno");
        // Resumen de qué se vendió en este día/turno (cantidad y valor por producto)
        const porProducto = {};
        for (const v of validas) {
          for (const it of v.items) {
            if (!porProducto[it.itemId]) porProducto[it.itemId] = { nombre: it.nombre, cant: 0, valor: 0 };
            porProducto[it.itemId].cant += it.cant;
            porProducto[it.itemId].valor += it.precio * it.cant;
          }
        }
        return {
          ...g,
          total: validas.reduce((s, v) => s + v.total, 0),
          numVentas: validas.length,
          numAnuladas: g.ventas.filter((v) => v.anulada).length,
          numInternas: g.ventas.filter((v) => v.tipoVenta === "interno" && !v.anulada).length,
          resumenProductos: Object.values(porProducto).sort((a, b) => b.cant - a.cant),
          efectivo: validas.reduce((s, v) => s + montoPorMetodo(v, "efectivo"), 0),
          transferencia: validas.reduce((s, v) => s + montoPorMetodo(v, "transferencia"), 0),
          porCobrar: g.ventas.filter((v) => !v.anulada && v.metodoPago === "pendiente").reduce((s, v) => s + v.total, 0),
        };
      })
      .sort((a, b) => b.orden - a.orden);
  }, [filtradas, agrupacion, store.cierres, store.cajaAbierta]);

  return (
    <div>
      {pendientes.length > 0 && (
        <button onClick={() => setFiltro("pendientes")} style={S.pendientesBanner}>
          <div style={S.pendientesBannerLeft}>
            <Clock size={18} />
            <span>{pendientes.length} cuenta{pendientes.length === 1 ? "" : "s"} por cobrar</span>
          </div>
          <span style={S.pendientesBannerTotal}>{CLP(totalPendiente)}</span>
        </button>
      )}

      <div className="hist-top-row" style={S.histTopRow}>
        <div className="hist-filters" style={S.histFilters}>
          {[
            { id: "todas", label: "Todas" },
            { id: "activas", label: "Activas" },
            { id: "pendientes", label: "Por cobrar" },
            { id: "interno", label: "Consumo interno" },
            { id: "anuladas", label: "Anuladas" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              style={{ ...S.rangeBtn, ...(filtro === f.id ? S.rangeBtnActive : {}) }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar por N° de pedido, cliente o producto…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="search-input" style={S.searchInput}
        />
      </div>

      <div style={S.histSummaryBar}>
        <span>{filtradas.length} venta(s)</span>
        <div style={S.agrupacionRow}>
          <span style={{ marginRight: 6 }}>Agrupar por:</span>
          {[
            { id: "dia", label: "Día" },
            { id: "turno", label: "Turno" },
          ].map((a) => (
            <button
              key={a.id}
              onClick={() => setAgrupacion(a.id)}
              style={{ ...S.agrupacionBtn, ...(agrupacion === a.id ? S.agrupacionBtnActive : {}) }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <span style={{ fontWeight: 800, color: COLORS.ink }}>{CLP(totalFiltradas)}</span>
      </div>

      {filtradas.length === 0 ? (
        <div style={S.emptyState}>No hay ventas que coincidan con el filtro</div>
      ) : (
        grupos.map((g) => (
          <div key={g.clave} style={S.grupoBloque}>
            <div style={S.grupoHeader}>
              <div>
                <div style={S.grupoTitulo}>{g.titulo}</div>
                <div style={S.grupoSub}>
                  {g.subtitulo ? g.subtitulo + " · " : ""}
                  {g.numVentas} venta{g.numVentas === 1 ? "" : "s"}
                  {g.numInternas > 0 && ` · ${g.numInternas} interno${g.numInternas === 1 ? "" : "s"}`}
                  {g.numAnuladas > 0 && ` · ${g.numAnuladas} anulada${g.numAnuladas === 1 ? "" : "s"}`}
                </div>
              </div>
              <div style={S.grupoTotal}>{CLP(g.total)}</div>
            </div>

            <button onClick={() => toggleResumen(g.clave)} style={S.verResumenBtn}>
              {resumenAbierto.has(g.clave) ? "▲ Ocultar qué se vendió" : "▼ Ver qué se vendió"}
            </button>

            {resumenAbierto.has(g.clave) && (
              <div style={S.grupoResumen}>
                {g.resumenProductos.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: COLORS.muted }}>Sin ventas registradas en este período</div>
                ) : (
                  <>
                    {g.resumenProductos.map((p) => (
                      <div key={p.nombre} style={S.grupoResumenRow}>
                        <span style={S.grupoResumenCant}>{p.cant}×</span>
                        <span style={S.grupoResumenNombre}>{p.nombre}</span>
                        <span style={S.grupoResumenValor}>{CLP(p.valor)}</span>
                      </div>
                    ))}
                    <div style={S.grupoResumenDivider} />
                    <div style={S.grupoResumenPagos}>
                      <span>💵 Efectivo {CLP(g.efectivo)}</span>
                      <span>🏦 Transferencia {CLP(g.transferencia)}</span>
                      {g.porCobrar > 0 && <span style={{ color: "#8A6D1D" }}>🕒 Por cobrar {CLP(g.porCobrar)}</span>}
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={S.histList}>
              {g.ventas.map((v) => (
                <button key={v.id} onClick={() => { setSelected(v); setCobrandoPendiente(false); resetCobroFields(); }} style={{ ...S.histRow, ...(v.anulada ? S.histRowAnulada : {}), ...(v.metodoPago === "pendiente" && !v.anulada ? S.histRowPendiente : {}) }}>
                  <div style={S.histRowLeft}>
                    <div style={S.histRowTop}>
                      {v.numeroPedido != null && <span style={S.numPedidoChip}>#{v.numeroPedido}</span>}
                      {v.tipoEntrega && <span style={S.entregaChip}>{LABEL_ENTREGA[v.tipoEntrega]}</span>}
                      <span style={S.histRowName}>
                        {v.tipoVenta === "interno" ? `Consumo interno · ${v.socioInterno}` : (v.nombreCliente || "Venta sin nombre")}
                      </span>
                      {v.anulada && <span style={S.anuladaTag}>ANULADA</span>}
                      {v.editada && !v.anulada && <span style={S.editadaTag}>EDITADA</span>}
                      {v.tipoVenta === "interno" && !v.anulada && <span style={S.internoTag}>INTERNO</span>}
                      {v.metodoPago === "pendiente" && !v.anulada && <span style={S.pendienteTag}>POR COBRAR</span>}
                    </div>
                    <div style={S.histRowSub}>
                      {v.hora} · {v.items.reduce((s, it) => s + it.cant, 0)} ítem(s) · {labelMetodoPago(v)}
                    </div>
                  </div>
                  <div style={S.histRowRight}>
                    <span style={{ ...S.histRowTotal, ...(v.anulada ? { textDecoration: "line-through", color: COLORS.muted } : {}) }}>
                      {CLP(v.total)}
                    </span>
                    <ChevronRight size={18} color={COLORS.muted} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {selected && !editingSale && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => { setSelected(null); setCobrandoPendiente(false); resetCobroFields(); }}>
          <div className="modal-card" style={S.modalCardWide} onClick={(e) => e.stopPropagation()}>
            <div style={S.detailHeader}>
              <div>
                <div style={S.modalTitle}>
                  {selected.numeroPedido != null && <span style={S.numPedidoTitulo}>#{selected.numeroPedido}</span>}
                  {selected.tipoVenta === "interno" ? `Consumo interno · ${selected.socioInterno}` : (selected.nombreCliente || "Venta sin nombre")}
                </div>
                <div style={S.detailMeta}>{selected.fecha} · {selected.hora} · {selected.tipoVenta === "interno" ? "sin cobro" : labelMetodoPago(selected)}</div>
              </div>
              <button onClick={() => { setSelected(null); setCobrandoPendiente(false); resetCobroFields(); }} style={S.closeX}><X size={18} /></button>
            </div>

            {selected.anulada && (
              <div style={S.anuladaBanner}>
                <AlertTriangle size={15} /> Esta venta fue anulada
                {selected.anuladaPor ? ` por ${selected.anuladaPor}` : ""}
                {selected.motivoAnulacion ? ` — ${selected.motivoAnulacion}` : ""}
              </div>
            )}
            {selected.direccion && (
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.inkSoft, margin: "8px 0" }}>📍 {selected.direccion}</div>
            )}
            {!selected.anulada && selected.tipoVenta === "interno" && (
              <div style={S.internoBanner}><ChefHat size={15} /> Consumo interno — no se cobró ni cuenta como ingreso</div>
            )}
            {!selected.anulada && selected.metodoPago === "pendiente" && (
              <div style={S.pendienteBanner}><Clock size={15} /> Cuenta pendiente por cobrar — no afecta la caja hasta que se marque como pagada</div>
            )}
            {selected.localizador && (
              <div style={S.localizadorBanner}><Phone size={15} /> Llamar al cliente: <b>{selected.localizador}</b></div>
            )}

            <div style={S.detailItems}>
              {selected.items.map((it) => (
                <div key={it.itemId}>
                  <div style={S.detailItemRow}>
                    <span>{it.cant}× {it.nombre}</span>
                    <span>{CLP(it.precio * it.cant)}</span>
                  </div>
                  {it.nota && it.nota.trim() && (
                    <div style={S.detailItemNota}>💬 {it.nota.trim()}</div>
                  )}
                </div>
              ))}
            </div>
            {selected.descuento && (
              <div style={S.detailDescuento}>
                <div style={S.detailSubRow}>Subtotal: {CLP(selected.subtotal || selected.total + selected.descuento.monto)}</div>
                <div style={{ ...S.detailSubRow, color: "#B4271A", fontWeight: 700 }}>
                  Descuento {selected.descuento.tipo === "porcentaje" ? `(${selected.descuento.valor}%)` : "fijo"}: − {CLP(selected.descuento.monto)}
                </div>
                <div style={{ ...S.detailSubRow, fontStyle: "italic" }}>Motivo: {selected.descuento.motivo}</div>
              </div>
            )}
            <div style={S.detailTotalRow}>
              <span>{selected.tipoVenta === "interno" ? "Valor de referencia" : "Total"}</span>
              <span>{CLP(selected.total)}</span>
            </div>
            {selected.metodoPago === "efectivo" && selected.montoRecibido != null && (
              <div style={S.detailSubRow}>
                Recibido {CLP(selected.montoRecibido)} · Vuelto {CLP(selected.montoRecibido - selected.total)}
              </div>
            )}
            {selected.pagadoEn && selected.pagadoEn !== selected.ts && (
              <div style={S.detailSubRow}>Cobrada el {fullDateTime(selected.pagadoEn)}</div>
            )}

            <div style={S.reprintRow}>
              {selected.tipoVenta !== "interno" && (
                <button onClick={() => { setPrintTarget("ambos"); printAmbos(selected); }} style={S.reprintBtnAmbos}>🖨️ Comanda y recibo</button>
              )}
              <button onClick={() => { setPrintTarget("comanda"); printComanda(selected); }} style={S.reprintBtn}>🖨️ Comanda</button>
              {selected.tipoVenta !== "interno" && (
                <button onClick={() => { setPrintTarget("recibo"); printRecibo(selected); }} style={S.reprintBtn}>🧾 Recibo</button>
              )}
            </div>

            {!store.esConsulta && !selected.anulada && selected.metodoPago === "pendiente" && (
              <div style={S.cobrarBlock}>
                {!cobrandoPendiente ? (
                  <button onClick={() => { resetCobroFields(); setCobrandoPendiente(true); }} style={S.cobrarAhoraBtn}>
                    💰 Marcar como pagada
                  </button>
                ) : (
                  <>
                    {(() => {
                      const descMonto = calcDescCobro(selected);
                      const totalCobro = (selected.subtotal || selected.total) - descMonto;
                      return (
                        <>
                          <div style={S.descuentoBlock}>
                            <label style={S.avisarCheckboxRow}>
                              <input type="checkbox" checked={descCobroActivo} onChange={(e) => setDescCobroActivo(e.target.checked)} style={S.checkbox} />
                              <span>Aplicar descuento</span>
                            </label>
                            {descCobroActivo && (
                              <div style={{ marginTop: 10 }}>
                                <div style={S.descTipoRow}>
                                  <button onClick={() => setDescCobroTipo("porcentaje")} style={{ ...S.descTipoBtn, ...(descCobroTipo === "porcentaje" ? S.descTipoActive : {}) }}>% Porcentaje</button>
                                  <button onClick={() => setDescCobroTipo("monto")} style={{ ...S.descTipoBtn, ...(descCobroTipo === "monto" ? S.descTipoActive : {}) }}>$ Monto fijo</button>
                                </div>
                                {descCobroTipo === "porcentaje" ? <input type="number" placeholder="Ej: 10 (%)" value={descCobroValor} onChange={(e) => setDescCobroValor(e.target.value)} style={{ ...S.cajaInput, textAlign: "left", marginTop: 8, fontWeight: 600, fontSize: 14.5 }} /> : <MoneyInput placeholder="Ej: $ 2.000" value={descCobroValor} onChange={setDescCobroValor} style={{ ...S.cajaInput, textAlign: "left", marginTop: 8, fontWeight: 600, fontSize: 14.5 }} />}
                                <input type="text" placeholder="Motivo del descuento (obligatorio)" value={descCobroMotivo} onChange={(e) => setDescCobroMotivo(e.target.value)} style={{ ...S.cajaInput, textAlign: "left", marginTop: 8, fontWeight: 600, fontSize: 14.5 }} />
                                {descMonto > 0 && (
                                  <div style={S.descResumen}>
                                    <span>Antes {CLP(selected.subtotal || selected.total)}</span>
                                    <span style={{ color: "#B4271A" }}>− {CLP(descMonto)}</span>
                                    <span style={{ fontWeight: 900 }}>Total {CLP(totalCobro)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div style={S.socioLabel}>Cobrar {CLP(totalCobro)}</div>
                          <MetodoPagoPicker
                            total={totalCobro}
                            metodoPago={metodoCobro}
                            setMetodoPago={setMetodoCobro}
                            montoRecibido={montoRecibidoCobro}
                            setMontoRecibido={setMontoRecibidoCobro}
                            montoEfectivoMixto={montoEfectivoMixtoCobro}
                            setMontoEfectivoMixto={setMontoEfectivoMixtoCobro}
                            montoTransferenciaMixto={montoTransferenciaMixtoCobro}
                            setMontoTransferenciaMixto={setMontoTransferenciaMixtoCobro}
                            allowPendiente={false}
                          />
                        </>
                      );
                    })()}
                    <div style={S.modalActions}>
                      <button onClick={() => { setCobrandoPendiente(false); resetCobroFields(); }} style={S.modalCancel}>Cancelar</button>
                      <button onClick={confirmarCobroPendiente} style={S.modalConfirm}>
                        <Check size={18} /> Confirmar cobro
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {store.esConsulta && (() => {
              const cmds = (store.comandos || []).filter((c) => c.ventaId === selected.id);
              return cmds.length > 0 ? (
                <div style={{ margin: "10px 0", fontSize: 12.5, fontWeight: 700 }}>
                  {cmds.slice(0, 4).map((c) => (
                    <div key={c.id} style={{ color: c.estado === "pendiente" ? "#B8860B" : "#2E9E5B" }}>
                      {c.estado === "pendiente" ? "⏳ Esperando a la caja" : c.resultado === "sin_efecto" ? "• Sin efecto" : "✓ Aplicado en la caja"} — {c.tipo === "anular_venta" ? "anular venta" : "corregir datos"}
                    </div>
                  ))}
                </div>
              ) : null;
            })()}
            {store.esConsulta && !selected.anulada && (
              <div style={S.modalActions}>
                <button
                  onClick={() => setCorrigiendo({
                    venta: selected,
                    nombreCliente: selected.nombreCliente || "",
                    tipoEntrega: selected.tipoEntrega || "mesa",
                    direccion: selected.direccion || "",
                    metodoPago: ["efectivo", "transferencia", "tarjeta"].includes(selected.metodoPago) ? selected.metodoPago : "",
                  })}
                  style={S.modalEditBtn}
                >
                  Corregir datos
                </button>
                <button onClick={() => { setAnularAdmin(selected); setMotivoAnul(""); }} style={S.modalAnularBtn}>
                  Anular venta
                </button>
              </div>
            )}
            {!store.esConsulta && !selected.anulada && (
              <div style={S.modalActions}>
                {selected.metodoPago === "pendiente" && (
                  <button
                    onClick={() => setEditingSale({ ...selected, items: selected.items.map((i) => ({ ...i })) })}
                    style={S.modalEditBtn}
                  >
                    Modificar / agregar productos
                  </button>
                )}
                <button onClick={() => setConfirmAnular(selected)} style={S.modalAnularBtn}>
                  Anular venta
                </button>
              </div>
            )}
          </div>
        </div></ModalPortal>
      )}

      {editingSale && (
        <EditSaleModal
          venta={editingSale}
          onCancel={() => setEditingSale(null)}
          onSave={guardarEdicion}
          insumos={store.insumos}
          showToast={showToast}
          menu={store.menu}
        />
      )}

      {confirmAnular && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmAnular(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Anular esta venta?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              Se restituirá el inventario descontado. La venta quedará marcada como anulada, no se eliminará.
            </div>
            <input type="text" value={motivoAnul} onChange={(e) => setMotivoAnul(e.target.value)} placeholder="Motivo de la anulación (obligatorio)" style={{ ...S.formInput, marginBottom: 14 }} />
            <div style={S.modalActions}>
              <button onClick={() => { setConfirmAnular(null); setMotivoAnul(""); }} style={S.modalCancel}>Volver</button>
              <button onClick={() => anularVenta(confirmAnular)} style={S.modalAnularConfirmBtn}>
                <AlertTriangle size={17} /> Sí, anular
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}
      {anularAdmin && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setAnularAdmin(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Anular la venta #{anularAdmin.numeroPedido ?? ""}?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              La orden queda en la nube y el PC de la caja la aplica una sola vez cuando esté conectado (restituye el inventario).
            </div>
            <input type="text" value={motivoAnul} onChange={(e) => setMotivoAnul(e.target.value)} placeholder="Motivo (obligatorio)" style={{ ...S.formInput, marginBottom: 14 }} />
            <div style={S.modalActions}>
              <button onClick={() => setAnularAdmin(null)} style={S.modalCancel}>Volver</button>
              <button
                disabled={enviando}
                onClick={async () => {
                  if (!motivoAnul.trim()) { showToast("Escribe el motivo", "error"); return; }
                  setEnviando(true);
                  try {
                    await store.enviarComando({ tipo: "anular_venta", ventaId: anularAdmin.id, motivo: motivoAnul.trim() });
                    showToast("Orden enviada a la caja");
                    setAnularAdmin(null);
                    setSelected(null);
                  } catch (e) {
                    showToast("No se pudo enviar: revisa tu internet", "error");
                  } finally {
                    setEnviando(false);
                  }
                }}
                style={S.modalAnularConfirmBtn}
              >
                <AlertTriangle size={17} /> Enviar orden
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      {corrigiendo && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setCorrigiendo(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Corregir datos de la venta</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              Los productos y el total no se cambian desde aquí. La caja aplica la corrección cuando esté conectada.
            </div>
            <label style={S.formLabel}>Cliente</label>
            <input type="text" value={corrigiendo.nombreCliente} onChange={(e) => setCorrigiendo({ ...corrigiendo, nombreCliente: e.target.value })} style={S.formInput} />
            {corrigiendo.venta.tipoVenta === "cliente" && (
              <>
                <label style={S.formLabel}>Tipo de entrega</label>
                <div style={S.catToggle}>
                  {TIPOS_ENTREGA.map((t) => (
                    <button key={t} onClick={() => setCorrigiendo({ ...corrigiendo, tipoEntrega: t })} style={{ ...S.catToggleBtn, ...(corrigiendo.tipoEntrega === t ? S.catToggleActive : {}) }}>{LABEL_ENTREGA[t]}</button>
                  ))}
                </div>
                {corrigiendo.tipoEntrega === "domicilio" && (
                  <>
                    <label style={S.formLabel}>Dirección</label>
                    <input type="text" value={corrigiendo.direccion} onChange={(e) => setCorrigiendo({ ...corrigiendo, direccion: e.target.value })} style={S.formInput} />
                  </>
                )}
                {corrigiendo.metodoPago !== "" || corrigiendo.venta.metodoPago === "pendiente" ? (
                  <>
                    <label style={S.formLabel}>Método de pago</label>
                    <div style={S.catToggle}>
                      {["efectivo", "transferencia", "tarjeta"].map((m) => (
                        <button key={m} onClick={() => setCorrigiendo({ ...corrigiendo, metodoPago: m })} style={{ ...S.catToggleBtn, ...(corrigiendo.metodoPago === m ? S.catToggleActive : {}) }}>{m === "efectivo" ? "Efectivo" : m === "transferencia" ? "Transf." : "Tarjeta"}</button>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            )}
            <div style={S.modalActions}>
              <button onClick={() => setCorrigiendo(null)} style={S.modalCancel}>Cancelar</button>
              <button
                disabled={enviando}
                onClick={async () => {
                  const v = corrigiendo.venta;
                  const cambios = {};
                  if ((corrigiendo.nombreCliente || "").trim() !== (v.nombreCliente || "")) cambios.nombreCliente = corrigiendo.nombreCliente;
                  if (v.tipoVenta === "cliente") {
                    if (corrigiendo.tipoEntrega !== (v.tipoEntrega || "mesa")) cambios.tipoEntrega = corrigiendo.tipoEntrega;
                    if (corrigiendo.tipoEntrega === "domicilio" && (corrigiendo.direccion || "").trim() !== (v.direccion || "")) cambios.direccion = corrigiendo.direccion;
                    if (corrigiendo.metodoPago && corrigiendo.metodoPago !== v.metodoPago) cambios.metodoPago = corrigiendo.metodoPago;
                  }
                  if (Object.keys(cambios).length === 0) { showToast("No hay cambios", "error"); return; }
                  setEnviando(true);
                  try {
                    await store.enviarComando({ tipo: "editar_datos_venta", ventaId: v.id, cambios });
                    showToast("Corrección enviada a la caja");
                    setCorrigiendo(null);
                    setSelected(null);
                  } catch (e) {
                    showToast("No se pudo enviar: revisa tu internet", "error");
                  } finally {
                    setEnviando(false);
                  }
                }}
                style={S.modalConfirm}
              >
                <Check size={18} /> Enviar corrección
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}
      {comandaAdicional && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => { setComandaAdicional(null); setSelected(null); }}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.ventaOkIcon}><Plus size={26} color="#fff" /></div>
            <div style={{ ...S.modalTitle, marginTop: 14 }}>Productos agregados a la cuenta</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              {comandaAdicional.numeroPedido != null && <b>Pedido #{comandaAdicional.numeroPedido} · </b>}
              {comandaAdicional.nombreCliente || "Cliente sin nombre"} · {comandaAdicional.items.reduce((s, it) => s + it.cant, 0)} producto(s) nuevo(s) para cocina
            </div>
            <div style={S.addedItemsPreview}>
              {comandaAdicional.items.map((it) => (
                <div key={it.itemId} style={S.addedItemLine}>
                  <span>{it.cant}× {it.nombre}</span>
                  {it.nota && <span style={S.addedItemNote}>({it.nota})</span>}
                </div>
              ))}
            </div>
            <div style={S.modalActions}>
              <button onClick={() => { setComandaAdicional(null); setSelected(null); }} style={S.modalCancel}>Cerrar sin imprimir</button>
              <button
                onClick={() => {
                  setPrintTarget("comanda-adicional");
                  printComanda(comandaAdicional);
                  setTimeout(() => { setComandaAdicional(null); setSelected(null); setPrintTarget("comanda"); }, 600);
                }}
                style={S.printBtn}
              >
                🖨️ Imprimir comanda adicional
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      <ComandaPrintArea venta={printTarget === "comanda" ? selected : printTarget === "comanda-adicional" ? comandaAdicional : null} />
      <ReciboPrintArea venta={printTarget === "recibo" ? selected : null} />
      <TicketsPrintPortal venta={printTarget === "ambos" ? selected : null} />
    </div>
  );
}

function EditSaleModal({ venta, onCancel, onSave, insumos, showToast, menu }) {
  const [items, setItems] = useState(venta.items);
  const [nombreCliente, setNombreCliente] = useState(venta.nombreCliente || "");
  const [localizador, setLocalizador] = useState(venta.localizador || "");
  const [saving, setSaving] = useState(false);
  const [mostrarMenu, setMostrarMenu] = useState(false);

  const changeQty = (itemId, delta) => {
    setItems((prev) =>
      prev.map((it) => (it.itemId === itemId ? { ...it, cant: Math.max(0, it.cant + delta) } : it)).filter((it) => it.cant > 0)
    );
  };

  const updateNota = (itemId, value) => {
    setItems((prev) => prev.map((it) => (it.itemId === itemId ? { ...it, nota: value } : it)));
  };

  const agregarProducto = (menuItem) => {
    // Validar stock considerando que en la edición se devuelve lo original y se descuenta lo nuevo,
    // así que solo importa el DELTA final. Aquí lo revisamos sumando 1 unidad más a los items actuales.
    const cartNuevoTest = [...items, ...(items.some(i => i.itemId === menuItem.id) ? [] : [{ itemId: menuItem.id, cant: 0 }])]
      .map(i => i.itemId === menuItem.id ? { itemId: i.itemId, cant: (i.cant || 0) + 1 } : { itemId: i.itemId, cant: i.cant });
    const cartOriginal = venta.items.map(i => ({ itemId: i.itemId, cant: i.cant }));
    const feas = checkStockDelta(insumos, cartOriginal, cartNuevoTest, menu);
    if (!feas.ok) {
      showToast && showToast(`Sin stock suficiente: ${feas.faltante}`, "error");
      return;
    }
    setItems((prev) => {
      const ex = prev.find((c) => c.itemId === menuItem.id);
      if (ex) return prev.map((c) => (c.itemId === menuItem.id ? { ...c, cant: c.cant + 1, agregadoEn: c.agregadoEn || Date.now() } : c));
      return [...prev, { itemId: menuItem.id, nombre: menuItem.nombre, precio: menuItem.precio, cant: 1, nota: "", agregadoEn: Date.now() }];
    });
  };

  const subtotal = items.reduce((s, it) => s + it.precio * it.cant, 0);
  // Si la cuenta ya tenía descuento, mostrar el total tal como quedará al guardar (mismo cálculo que guardarEdicion)
  const descuentoPreview = venta.descuento
    ? (venta.descuento.tipo === "porcentaje"
        ? Math.round((subtotal * Math.min(venta.descuento.valor, 100)) / 100)
        : Math.min(venta.descuento.valor, subtotal))
    : 0;
  const total = subtotal - descuentoPreview;

  const handleSave = () => {
    setSaving(true);
    const ok = onSave({ ...venta, items, nombreCliente: nombreCliente.trim() || null, localizador: localizador.trim() || null });
    if (!ok) setSaving(false);
  };

  return (
    <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={onCancel}>
      <div className="modal-card" style={S.modalCardWide} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailHeader}>
          <div style={S.modalTitle}>Modificar venta</div>
          <button onClick={onCancel} style={S.closeX}><X size={18} /></button>
        </div>

        <input
          type="text"
          placeholder="Nombre del cliente (opcional)"
          value={nombreCliente}
          onChange={(e) => setNombreCliente(e.target.value)}
          style={{ ...S.cajaInput, textAlign: "left", marginBottom: 10, fontSize: 14.5, fontWeight: 600 }}
        />
        <input
          type="tel"
          placeholder="Número para avisar al cliente (opcional)"
          value={localizador}
          onChange={(e) => setLocalizador(e.target.value)}
          style={{ ...S.cajaInput, textAlign: "left", marginBottom: 14, fontSize: 14.5, fontWeight: 600 }}
        />

        <div style={S.detailItems}>
          {items.length === 0 && <div style={S.emptyState}>Sin productos — no se puede guardar una venta vacía</div>}
          {items.map((it) => (
            <div key={it.itemId} style={S.editItemBlock}>
              <div style={S.editItemRow}>
                <div style={S.cartRowInfo}>
                  <div style={S.cartRowName}>{it.nombre}</div>
                  <div style={S.cartRowPrice}>{CLP(it.precio)} c/u</div>
                </div>
                <div style={S.qtyControls}>
                  <button onClick={() => changeQty(it.itemId, -1)} style={S.qtyBtn}><Minus size={15} /></button>
                  <span style={S.qtyNum}>{it.cant}</span>
                  <button onClick={() => changeQty(it.itemId, 1)} style={S.qtyBtn}><Plus size={15} /></button>
                </div>
              </div>
              <input
                type="text"
                value={it.nota || ""}
                onChange={(e) => updateNota(it.itemId, e.target.value)}
                placeholder="Nota para cocina (ej: sin cebolla)"
                style={S.cartNotaInput}
              />
            </div>
          ))}
        </div>

        {!mostrarMenu ? (
          <button onClick={() => setMostrarMenu(true)} style={S.addProductBtn}>
            <Plus size={16} /> Agregar productos a la cuenta
          </button>
        ) : (
          <div style={S.addProductPanel}>
            <div style={S.addProductHeader}>
              <span>Elige productos para agregar</span>
              <button onClick={() => setMostrarMenu(false)} style={S.closeX}><X size={16} /></button>
            </div>
            <div style={S.addProductList}>
              {(menu || MENU_INICIAL).map((mi) => {
                const feas = checkStock(insumos || [], [{ itemId: mi.id, cant: 1 }], menu);
                return (
                  <button
                    key={mi.id}
                    onClick={() => agregarProducto(mi)}
                    disabled={!feas.ok}
                    style={{ ...S.addProductItem, ...(feas.ok ? {} : S.addProductItemDisabled) }}
                  >
                    <div>
                      <div style={S.addProductName}>{mi.nombre}</div>
                      <div style={S.addProductPrice}>{CLP(mi.precio)}</div>
                    </div>
                    {feas.ok ? <Plus size={17} /> : <span style={S.outStockTag}>Sin stock</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {venta.descuento && (
          <div style={S.detailSubRow}>
            Subtotal {CLP(subtotal)} · Descuento {venta.descuento.tipo === "porcentaje" ? `${venta.descuento.valor}%` : "fijo"}: − {CLP(descuentoPreview)}
          </div>
        )}
        <div style={S.detailTotalRow}>
          <span>Nuevo total</span>
          <span>{CLP(total)}</span>
        </div>


        <div style={S.modalActions}>
          <button onClick={onCancel} disabled={saving} style={S.modalCancel}>Cancelar</button>
          <button onClick={handleSave} disabled={saving || items.length === 0} style={S.modalConfirm}>
            {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div></ModalPortal>
  );
}

function restoreStock(insumos, cartItems, menu = MENU_INICIAL) {
  const give = {};
  for (const ci of cartItems) {
    const menuItem = menu.find((m) => m.id === ci.itemId);
    if (!menuItem) continue;
    for (const r of menuItem.recipe) {
      give[r.insumoId] = (give[r.insumoId] || 0) + r.cant * ci.cant;
    }
  }
  return insumos.map((ins) => (give[ins.id] ? { ...ins, stock: ins.stock + give[ins.id] } : ins));
}

function checkStockDelta(insumos, cartOriginal, cartNuevo, menu = MENU_INICIAL) {
  // simula: devolver lo original, luego chequear si alcanza para lo nuevo
  const simulated = restoreStock(insumos, cartOriginal, menu);
  return checkStock(simulated, cartNuevo, menu);
}

function InventarioView({ store, showToast, isMobile, soloAdmin = false }) {
  const [showAddStock, setShowAddStock] = useState(null);
  const [addAmount, setAddAmount] = useState("");
  const [editingInsumo, setEditingInsumo] = useState(null); // insumo completo o {} para nuevo
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDisable, setConfirmDisable] = useState(null);
  const [editingProducto, setEditingProducto] = useState(null); // producto del menú o {} para nuevo
  const [confirmDeleteProd, setConfirmDeleteProd] = useState(null);
  const [nuevoConsumo, setNuevoConsumo] = useState("");
  const [confirmDeleteConsumo, setConfirmDeleteConsumo] = useState(null);
  const [ajustando, setAjustando] = useState(null); // insumo al que se le está ajustando el stock
  const [pinParaAjustar, setPinParaAjustar] = useState(null); // insumo pendiente de PIN antes de ajustar

  // En el módulo ventas (no admin), ajustar inventario requiere el PIN de administrador si está configurado
  // Ya no hay PIN: la caja inicia sesión con su usuario y cada ajuste queda en la bitácora con el nombre del cajero.
  const pedirAjuste = (ins) => setAjustando(ins);
  const [motivoAccion, setMotivoAccion] = useState("");
  const [verBitacora, setVerBitacora] = useState(false);

  const sorted = [...store.insumos].sort((a, b) => {
    const aLow = a.activo !== false && a.stock <= a.minimo;
    const bLow = b.activo !== false && b.stock <= b.minimo;
    if (aLow !== bLow) return aLow ? -1 : 1;
    if (a.activo === false && b.activo !== false) return 1;
    if (b.activo === false && a.activo !== false) return -1;
    return a.nombre.localeCompare(b.nombre);
  });

  const lowCount = store.insumos.filter((i) => i.activo !== false && i.stock <= i.minimo).length;
  const totalValue = store.insumos.reduce((s, i) => s + i.stock * i.costoUnit, 0);

  const usedIn = (insumoId) => store.menu.filter((m) => m.recipe.some((r) => r.insumoId === insumoId)).map((m) => m.nombre);

  const applyAddStock = (id) => {
    const amt = parseFloat(addAmount);
    if (isNaN(amt) || amt <= 0) { showToast("Ingresa una cantidad válida", "error"); return; }
    const ins = store.insumos.find((i) => i.id === id);
    const next = store.insumos.map((i) => (i.id === id ? { ...i, stock: i.stock + amt } : i));
    store.saveInsumos(next);
    store.registrarMovInv({
      id: uid(), ts: Date.now(), fecha: todayStr(), hora: nowTime(),
      insumoId: id, insumoNombre: ins.nombre, tipo: "reabastecimiento",
      cantAnterior: ins.stock, cantNueva: ins.stock + amt, delta: amt,
      motivo: "Reabastecimiento",
    });
    setShowAddStock(null);
    setAddAmount("");
    showToast("Stock actualizado");
  };

  const aplicarAjuste = ({ insumo, nuevoStock, motivo, nota }) => {
    const valor = parseFloat(nuevoStock);
    if (isNaN(valor) || valor < 0) { showToast("Cantidad inválida", "error"); return false; }
    if (!motivo) { showToast("Selecciona el motivo del ajuste", "error"); return false; }
    if (motivo === "Otro" && !nota.trim()) { showToast("Describe el motivo del ajuste", "error"); return false; }
    if (valor === insumo.stock) { showToast("La cantidad es igual a la actual", "error"); return false; }

    const next = store.insumos.map((i) => (i.id === insumo.id ? { ...i, stock: valor } : i));
    store.saveInsumos(next);
    store.registrarMovInv({
      id: uid(), ts: Date.now(), fecha: todayStr(), hora: nowTime(),
      insumoId: insumo.id, insumoNombre: insumo.nombre, tipo: "ajuste",
      cantAnterior: insumo.stock, cantNueva: valor, delta: valor - insumo.stock,
      motivo, nota: nota.trim() || null,
    });
    setAjustando(null);
    showToast("Ajuste registrado en la bitácora");
    return true;
  };

  const toggleActivo = (ins) => {
    if (!motivoAccion.trim()) { showToast("Escribe el motivo", "error"); return; }
    const next = store.insumos.map((i) => (i.id === ins.id ? { ...i, activo: i.activo === false } : i));
    store.saveInsumos(next);
    store.registrarMovInv({
      id: uid(), ts: Date.now(), fecha: todayStr(), hora: nowTime(),
      insumoId: ins.id, insumoNombre: ins.nombre,
      tipo: ins.activo === false ? "habilitado" : "deshabilitado",
      cantAnterior: ins.stock, cantNueva: ins.stock, delta: 0,
      motivo: ins.activo === false ? "Insumo habilitado" : "Insumo deshabilitado",
      nota: motivoAccion.trim(),
    });
    setMotivoAccion("");
    setConfirmDisable(null);
    showToast(ins.activo === false ? `${ins.nombre} habilitado` : `${ins.nombre} deshabilitado`);
  };

  const deleteInsumo = (ins) => {
    if (!motivoAccion.trim()) { showToast("Escribe el motivo", "error"); return; }
    const next = store.insumos.filter((i) => i.id !== ins.id);
    store.saveInsumos(next);
    store.registrarMovInv({
      id: uid(), ts: Date.now(), fecha: todayStr(), hora: nowTime(),
      insumoId: ins.id, insumoNombre: ins.nombre, tipo: "eliminacion",
      cantAnterior: ins.stock, cantNueva: 0, delta: -ins.stock,
      motivo: "Insumo eliminado del inventario",
      nota: motivoAccion.trim(),
    });
    setMotivoAccion("");
    setConfirmDelete(null);
    showToast(`${ins.nombre} eliminado del inventario`);
  };

  const saveInsumo = (data) => {
    if (!data.nombre.trim()) { showToast("El nombre es obligatorio", "error"); return false; }
    if (isNaN(data.costoUnit) || data.costoUnit < 0) { showToast("Costo unitario inválido", "error"); return false; }
    if (isNaN(data.stock) || data.stock < 0) { showToast("Stock inválido", "error"); return false; }
    if (isNaN(data.minimo) || data.minimo < 0) { showToast("Mínimo inválido", "error"); return false; }

    if (data.id) {
      // Editar: se cambian datos del insumo pero NUNCA el stock.
      // El stock solo se mueve con "Reabastecer" o "Ajustar", que quedan en la bitácora.
      const antes = store.insumos.find((i) => i.id === data.id);
      const next = store.insumos.map((i) =>
        i.id === data.id
          ? { ...i, nombre: data.nombre, unidad: data.unidad, costoUnit: data.costoUnit, minimo: data.minimo }
          : i
      );
      store.saveInsumos(next);
      if (antes) {
        const cambios = [];
        if (antes.nombre !== data.nombre) cambios.push(`nombre "${antes.nombre}" → "${data.nombre}"`);
        if (antes.unidad !== data.unidad) cambios.push(`unidad ${antes.unidad} → ${data.unidad}`);
        if (antes.costoUnit !== data.costoUnit) cambios.push(`costo ${CLP(antes.costoUnit)} → ${CLP(data.costoUnit)}`);
        if (antes.minimo !== data.minimo) cambios.push(`mínimo ${antes.minimo} → ${data.minimo}`);
        if (cambios.length > 0) {
          store.registrarMovInv({
            id: uid(), ts: Date.now(), fecha: todayStr(), hora: nowTime(),
            insumoId: data.id, insumoNombre: data.nombre, tipo: "edicion",
            cantAnterior: antes.stock, cantNueva: antes.stock, delta: 0,
            motivo: "Edición de datos del insumo", nota: cambios.join("; "),
          });
        }
      }
      showToast("Insumo actualizado");
    } else {
      // nuevo
      const newId = data.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) + "_" + uid().slice(0, 4);
      const next = [...store.insumos, { ...data, id: newId, activo: true }];
      store.saveInsumos(next);
      store.registrarMovInv({
        id: uid(), ts: Date.now(), fecha: todayStr(), hora: nowTime(),
        insumoId: newId, insumoNombre: data.nombre, tipo: "creacion",
        cantAnterior: 0, cantNueva: data.stock, delta: data.stock,
        motivo: "Insumo creado con stock inicial",
      });
      showToast("Insumo agregado");
    }
    setEditingInsumo(null);
    return true;
  };

  const saveProducto = (data) => {
    if (!data.nombre.trim()) { showToast("El nombre es obligatorio", "error"); return false; }
    const precio = parseFloat(data.precio);
    if (isNaN(precio) || precio < 0) { showToast("Precio inválido", "error"); return false; }
    const costoUnit = data.costoUnit === "" || data.costoUnit == null ? null : (parseFloat(data.costoUnit) || 0);

    // La receta puede estar vacía (producto que no descuenta inventario) o tener insumos válidos
    const recipe = (data.recipe || []).filter((r) => r.insumoId && r.cant > 0);

    if (data.id) {
      const next = store.menu.map((m) => (m.id === data.id ? { ...m, nombre: data.nombre.trim(), precio, costoUnit, desc: data.desc || "", color: data.color || CATEGORIA_POR_DEFECTO, recipe } : m));
      store.saveMenu(next);
      showToast("Producto actualizado");
    } else {
      const newId = data.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30) + "_" + uid().slice(0, 4);
      const next = [...store.menu, { id: newId, nombre: data.nombre.trim(), precio, costoUnit, desc: data.desc || "", color: data.color || CATEGORIA_POR_DEFECTO, recipe }];
      store.saveMenu(next);
      showToast("Producto agregado al menú");
    }
    setEditingProducto(null);
    return true;
  };

  const deleteProducto = (prod) => {
    const next = store.menu.filter((m) => m.id !== prod.id);
    store.saveMenu(next);
    setConfirmDeleteProd(null);
    showToast(`${prod.nombre} eliminado del menú`);
  };

  const addConsumo = () => {
    const nombre = nuevoConsumo.trim();
    if (!nombre) { showToast("Escribe un nombre o rol", "error"); return; }
    if (store.consumoInterno.some((n) => n.toLowerCase() === nombre.toLowerCase())) {
      showToast("Ese nombre ya está en la lista", "error");
      return;
    }
    store.saveConsumoInterno([...store.consumoInterno, nombre]);
    setNuevoConsumo("");
    showToast(`${nombre} agregado`);
  };

  const deleteConsumo = (nombre) => {
    store.saveConsumoInterno(store.consumoInterno.filter((n) => n !== nombre));
    setConfirmDeleteConsumo(null);
    showToast(`${nombre} quitado de la lista`);
  };

  return (
    <div>
      <div className="stats-row" style={S.statsRow}>
        <StatCard icon={Boxes} label="Insumos totales" value={store.insumos.length} color="#822D1B" />
        <StatCard icon={AlertTriangle} label="Stock bajo" value={lowCount} color="#B4443B" alert={lowCount > 0} />
        <StatCard icon={CircleDollarSign} label="Valor de inventario" value={CLP(totalValue)} color="#2E9E5B" />
      </div>

      {!store.esConsulta && (
        <div style={S.invTopRow}>
          <div />
          <button onClick={() => setEditingInsumo({})} style={S.newInsumoBtn}>
            <Plus size={16} /> Nuevo insumo
          </button>
        </div>
      )}

      <div className="table-scroll" style={S.tableCard}>
        <div style={S.tableHead}>
          <span style={{ flex: 2 }}>Insumo</span>
          <span style={{ flex: 1 }}>Stock</span>
          <span style={{ flex: 0.8 }}>Mínimo</span>
          <span style={{ flex: 1 }}>Costo unit.</span>
          <span style={{ flex: 2.2 }}>Acciones</span>
        </div>
        <div style={S.tableBody}>
          {sorted.map((ins) => {
            const inactivo = ins.activo === false;
            const low = !inactivo && ins.stock <= ins.minimo;
            return (
              <div key={ins.id} style={{ ...S.tableRow, ...(low ? S.tableRowLow : {}), ...(inactivo ? S.tableRowInactive : {}) }}>
                <div style={{ flex: 2, fontWeight: 600, color: inactivo ? COLORS.muted : "#3A241E" }}>
                  {ins.nombre}
                  {low && <span style={S.lowBadge}>BAJO</span>}
                  {inactivo && <span style={S.inactiveBadge}>INACTIVO</span>}
                </div>
                <div style={{ flex: 1, color: inactivo ? COLORS.muted : "#3A241E" }}>{ins.stock} {ins.unidad}</div>
                <div style={{ flex: 0.8, color: inactivo ? COLORS.muted : "#3A241E" }}>{ins.minimo}</div>
                <div style={{ flex: 1, color: COLORS.muted }}>{CLP(ins.costoUnit)}</div>
                <div style={{ flex: 2.2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {store.esConsulta ? (
                    <span style={{ fontSize: 12, color: COLORS.muted, fontWeight: 600 }}>—</span>
                  ) : showAddStock === ins.id ? (
                    <div style={S.addStockRow}>
                      <input
                        autoFocus
                        value={addAmount}
                        onChange={(e) => setAddAmount(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && applyAddStock(ins.id)}
                        placeholder="+cant"
                        type="number"
                        style={S.inlineInputSmall}
                      />
                      <button onClick={() => applyAddStock(ins.id)} style={S.miniBtnOk}><Check size={14} /></button>
                      <button onClick={() => { setShowAddStock(null); setAddAmount(""); }} style={S.miniBtnX}><X size={14} /></button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => setShowAddStock(ins.id)} style={S.addStockBtn} title="Reabastecer">
                        <Plus size={13} />
                      </button>
                      <button onClick={() => pedirAjuste(ins)} style={S.ajusteBtn} title="Ajustar stock (queda en bitácora)">
                        <RotateCcw size={13} />
                      </button>
                      <button onClick={() => setEditingInsumo(ins)} style={S.iconActionBtn} title="Editar">
                        <Settings size={13} />
                      </button>
                      <button onClick={() => setConfirmDisable(ins)} style={S.iconActionBtn} title={inactivo ? "Habilitar" : "Deshabilitar"}>
                        {inactivo ? <Check size={13} /> : <X size={13} />}
                      </button>
                      <button onClick={() => setConfirmDelete(ins)} style={S.iconActionBtnDanger} title="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BitacoraInventario
        movs={store.movsInventario}
        abierto={verBitacora}
        onToggle={() => setVerBitacora((v) => !v)}
      />

      {ajustando && (
        <AjusteStockModal
          insumo={ajustando}
          onCancel={() => setAjustando(null)}
          onSave={aplicarAjuste}
        />
      )}

      {editingProducto && (
        <ProductoFormModal
          producto={editingProducto}
          insumos={store.insumos}
          categorias={store.categorias}
          onCancel={() => setEditingProducto(null)}
          onSave={saveProducto}
        />
      )}

      {confirmDeleteProd && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmDeleteProd(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Eliminar "{confirmDeleteProd.nombre}"?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              Ya no aparecerá en el punto de venta. Las ventas antiguas que lo incluyan se conservan intactas.
            </div>
            <div style={S.modalActions}>
              <button onClick={() => setConfirmDeleteProd(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => deleteProducto(confirmDeleteProd)} style={S.modalAnularConfirmBtn}>
                <Trash2 size={17} /> Eliminar
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      {editingInsumo && (
        <InsumoFormModal
          insumo={editingInsumo}
          onCancel={() => setEditingInsumo(null)}
          onSave={saveInsumo}
        />
      )}

      {confirmDisable && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmDisable(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>
              {confirmDisable.activo === false ? "¿Habilitar" : "¿Deshabilitar"} "{confirmDisable.nombre}"?
            </div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              {confirmDisable.activo === false
                ? "Volverá a estar disponible para descontarse en las ventas."
                : "No se podrá vender ningún producto que lo necesite mientras esté deshabilitado. El stock se conserva."}
            </div>
            {usedIn(confirmDisable.id).length > 0 && (
              <div style={S.usedInBox}>
                Se usa en: {usedIn(confirmDisable.id).join(", ")}
              </div>
            )}
            <input type="text" value={motivoAccion} onChange={(e) => setMotivoAccion(e.target.value)} placeholder="Motivo (obligatorio)" style={{ ...S.formInput, marginBottom: 14 }} />
            <div style={S.modalActions}>
              <button onClick={() => { setConfirmDisable(null); setMotivoAccion(""); }} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => toggleActivo(confirmDisable)} style={S.modalConfirm}>
                <Check size={18} /> {confirmDisable.activo === false ? "Habilitar" : "Deshabilitar"}
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmDelete(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Eliminar "{confirmDelete.nombre}"?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              Esta acción no se puede deshacer. Se perderá el historial de stock y costo de este insumo.
            </div>
            {usedIn(confirmDelete.id).length > 0 && (
              <div style={S.usedInBoxDanger}>
                <AlertTriangle size={14} /> Se usa en: {usedIn(confirmDelete.id).join(", ")}. Esos productos quedarán imposibles de vender.
              </div>
            )}
            <input type="text" value={motivoAccion} onChange={(e) => setMotivoAccion(e.target.value)} placeholder="Motivo (obligatorio)" style={{ ...S.formInput, marginBottom: 14 }} />
            <div style={S.modalActions}>
              <button onClick={() => { setConfirmDelete(null); setMotivoAccion(""); }} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => deleteInsumo(confirmDelete)} style={S.modalAnularConfirmBtn}>
                <Trash2 size={16} /> Eliminar
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

function ProductoFormModal({ producto, insumos, categorias = CATEGORIAS_INICIALES, onCancel, onSave }) {
  const [nombre, setNombre] = useState(producto.nombre || "");
  const [precio, setPrecio] = useState(producto.precio != null ? String(producto.precio) : "");
  const [costoUnit, setCostoUnit] = useState(producto.costoUnit != null ? String(producto.costoUnit) : "");
  const [desc, setDesc] = useState(producto.desc || "");
  const [color, setColor] = useState(producto.color || CATEGORIA_POR_DEFECTO);
  const [recipe, setRecipe] = useState(producto.recipe ? producto.recipe.map((r) => ({ ...r })) : []);
  const esNuevo = !producto.id;
  const insumosActivos = insumos.filter((i) => i.activo !== false);

  // Margen en vivo para ayudar a decidir el precio
  const precioNum = parseFloat(precio) || 0;
  const costoNum = parseFloat(costoUnit) || 0;
  const ganancia = precioNum - costoNum;
  const margenPct = precioNum > 0 ? (ganancia / precioNum) * 100 : 0;

  const addRecipeRow = () => {
    const disponible = insumosActivos.find((i) => !recipe.some((r) => r.insumoId === i.id));
    if (!disponible) return;
    setRecipe([...recipe, { insumoId: disponible.id, cant: 1 }]);
  };
  const updateRecipe = (idx, campo, valor) => {
    setRecipe(recipe.map((r, i) => (i === idx ? { ...r, [campo]: campo === "cant" ? parseFloat(valor) || 0 : valor } : r)));
  };
  const removeRecipe = (idx) => setRecipe(recipe.filter((_, i) => i !== idx));

  const handleSave = () => {
    onSave({ ...producto, nombre, precio, costoUnit, desc, color, recipe });
  };

  return (
    <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={onCancel}>
      <div className="modal-card" style={S.modalCardWide} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailHeader}>
          <div style={S.modalTitle}>{esNuevo ? "Nuevo producto" : "Editar producto"}</div>
          <button onClick={onCancel} style={S.closeX}><X size={18} /></button>
        </div>

        <label style={S.formLabel}>Nombre del producto</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Pizza Napolitana" style={S.formInput} />

        <label style={S.formLabel}>Precio de venta</label>
        <MoneyInput value={precio} onChange={setPrecio} placeholder="Ej: $ 28.000" style={S.formInput} />

        <label style={S.formLabel}>Costo por unidad</label>
        <MoneyInput value={costoUnit} onChange={setCostoUnit} placeholder="Lo que te cuesta armar/comprar cada unidad" style={S.formInput} />
        <div style={S.recipeHelp}>
          Para pizzas, el costo total de prepararla (masa, queso, ingredientes). Para bebidas, lo que te cuesta cada una. Este número es el que se usa para tu margen.
        </div>
        {precioNum > 0 && costoNum > 0 && (
          <div style={S.margenPreview}>
            <span>Ganancia por unidad: <b style={{ color: ganancia >= 0 ? "#2E9E5B" : "#B4271A" }}>{CLP(ganancia)}</b></span>
            <span style={S.margenPct(margenPct)}>{margenPct.toFixed(0)}% margen</span>
          </div>
        )}

        <label style={S.formLabel}>Categoría</label>
        <div style={S.catToggle}>
          {categorias.map((c) => (
            <button key={c.id} onClick={() => setColor(c.id)} style={{ ...S.catToggleBtn, ...(color === c.id ? S.catToggleActive : {}) }}>{c.icono} {c.nombre}</button>
          ))}
        </div>

        <label style={S.formLabel}>Descripción (opcional)</label>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ingredientes o detalle" style={S.formInput} />

        <label style={S.formLabel}>Insumos que descuenta del inventario</label>
        <div style={S.recipeHelp}>
          Cada venta de este producto descuenta estos insumos. Déjalo vacío si no quieres que descuente stock.
        </div>
        {recipe.map((r, idx) => (
          <div key={idx} style={S.recipeRow}>
            <select value={r.insumoId} onChange={(e) => updateRecipe(idx, "insumoId", e.target.value)} style={S.recipeSelect}>
              {insumosActivos.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
            <input type="number" value={r.cant} onChange={(e) => updateRecipe(idx, "cant", e.target.value)} style={S.recipeCant} min="0" step="0.1" />
            <button onClick={() => removeRecipe(idx)} style={S.recipeDelBtn}><X size={15} /></button>
          </div>
        ))}
        {recipe.length < insumosActivos.length && (
          <button onClick={addRecipeRow} style={S.recipeAddBtn}>
            <Plus size={14} /> Agregar insumo
          </button>
        )}

        <div style={{ ...S.modalActions, marginTop: 20 }}>
          <button onClick={onCancel} style={S.modalCancel}>Cancelar</button>
          <button onClick={handleSave} style={S.modalConfirm}><Check size={18} /> {esNuevo ? "Crear producto" : "Guardar"}</button>
        </div>
      </div>
    </div></ModalPortal>
  );
}

// ---- Bitácora de inventario: registro permanente de los cambios manuales de stock ----
const MOTIVOS_AJUSTE = ["Merma o daño", "Error de conteo", "Pérdida o robo", "Devolución a proveedor", "Otro"];

function BitacoraInventario({ movs, abierto, onToggle }) {
  const lista = (movs || []).slice().reverse();
  const ajustesRecientes = lista.filter(
    (m) => m.tipo === "ajuste" && m.ts > Date.now() - 7 * 24 * 60 * 60 * 1000
  ).length;

  const estiloTipo = (tipo) => {
    if (tipo === "ajuste") return { fondo: "#FBF3DC", color: "#8A6D1D", texto: "AJUSTE" };
    if (tipo === "reabastecimiento") return { fondo: "#EAF6EE", color: "#1D7A44", texto: "REABASTECIÓ" };
    if (tipo === "eliminacion") return { fondo: "#FBEEEC", color: "#B4271A", texto: "ELIMINÓ" };
    if (tipo === "creacion") return { fondo: "#EAF3FB", color: "#3A5FA0", texto: "CREÓ" };
    return { fondo: "#F3ECE6", color: COLORS.muted, texto: tipo.toUpperCase() };
  };

  return (
    <div style={S.productosSection}>
      <div style={S.productosHeader}>
        <div style={S.breakdownTitle}>Bitácora de inventario</div>
        {ajustesRecientes > 0 && (
          <span style={S.bitacoraAlerta}>{ajustesRecientes} ajuste{ajustesRecientes === 1 ? "" : "s"} en 7 días</span>
        )}
      </div>
      <div style={S.consumoHelp}>
        Cada cambio manual de stock queda registrado aquí con quién lo hizo, y una copia se guarda en la nube que la caja no puede modificar ni borrar.
        Las salidas por ventas no aparecen: esas ya quedan en el Historial de ventas.
      </div>

      <button onClick={onToggle} style={S.verResumenBtn}>
        {abierto ? "▲ Ocultar bitácora" : `▼ Ver bitácora (${lista.length} movimiento${lista.length === 1 ? "" : "s"})`}
      </button>

      {abierto && (
        <div style={S.bitacoraList}>
          {lista.length === 0 ? (
            <div style={S.emptyState}>Todavía no hay movimientos manuales registrados</div>
          ) : (
            lista.slice(0, 100).map((m) => {
              const et = estiloTipo(m.tipo);
              return (
                <div key={m.id} style={S.bitacoraRow}>
                  <div style={S.bitacoraLeft}>
                    <div style={S.bitacoraTop}>
                      <span style={{ ...S.bitacoraTag, background: et.fondo, color: et.color }}>{et.texto}</span>
                      <span style={S.bitacoraInsumo}>{m.insumoNombre}</span>
                    </div>
                    <div style={S.bitacoraSub}>
                      {m.fecha} · {m.hora} · {m.por || "—"} — {m.motivo}
                      {m.nota ? `: ${m.nota}` : ""}
                    </div>
                  </div>
                  <div style={S.bitacoraRight}>
                    <span style={{ ...S.bitacoraDelta, color: m.delta > 0 ? "#1D7A44" : m.delta < 0 ? "#B4271A" : COLORS.muted }}>
                      {m.delta > 0 ? "+" : ""}{m.delta}
                    </span>
                    <span style={S.bitacoraStocks}>{m.cantAnterior} → {m.cantNueva}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function AjusteStockModal({ insumo, onCancel, onSave }) {
  const [nuevoStock, setNuevoStock] = useState(String(insumo.stock));
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");

  const valor = parseFloat(nuevoStock);
  const diferencia = !isNaN(valor) ? valor - insumo.stock : 0;

  return (
    <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={onCancel}>
      <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalTitle}>Ajustar stock</div>
        <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 18 }}>
          {insumo.nombre} · el sistema tiene <b>{insumo.stock} {insumo.unidad}</b>
        </div>

        <label style={S.formLabel}>Cantidad real contada</label>
        <input
          type="number"
          autoFocus
          value={nuevoStock}
          onChange={(e) => setNuevoStock(e.target.value)}
          style={{ ...S.formInput, marginBottom: 10 }}
        />
        {!isNaN(valor) && diferencia !== 0 && (
          <div style={{ ...S.diffPreview, marginTop: 0, marginBottom: 16, color: diferencia < 0 ? "#B4271A" : "#1D7A44" }}>
            {diferencia > 0 ? `Sobran ${diferencia}` : `Faltan ${Math.abs(diferencia)}`} {insumo.unidad}
          </div>
        )}

        <label style={S.formLabel}>Motivo del ajuste (obligatorio)</label>
        <div style={S.motivoList}>
          {MOTIVOS_AJUSTE.map((m) => (
            <button
              key={m}
              onClick={() => setMotivo(m)}
              style={{ ...S.motivoBtn, ...(motivo === m ? S.motivoBtnActive : {}) }}
            >
              {m}
            </button>
          ))}
        </div>

        {motivo === "Otro" && (
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Describe qué pasó"
            style={{ ...S.formInput, marginBottom: 12 }}
          />
        )}

        <div style={S.ajusteAviso}>
          Este ajuste quedará registrado en la bitácora con fecha, hora y motivo.
        </div>

        <div style={S.modalActions}>
          <button onClick={onCancel} style={S.modalCancel}>Cancelar</button>
          <button onClick={() => onSave({ insumo, nuevoStock, motivo, nota })} style={S.modalConfirm}>
            <Check size={18} /> Registrar ajuste
          </button>
        </div>
      </div>
    </div></ModalPortal>
  );
}

function InsumoFormModal({ insumo, onCancel, onSave }) {
  const isNew = !insumo.id;
  const [nombre, setNombre] = useState(insumo.nombre || "");
  const [unidad, setUnidad] = useState(insumo.unidad || "unid");
  const [stock, setStock] = useState(insumo.stock != null ? String(insumo.stock) : "0");
  const [minimo, setMinimo] = useState(insumo.minimo != null ? String(insumo.minimo) : "0");
  const [costoUnit, setCostoUnit] = useState(insumo.costoUnit != null ? String(insumo.costoUnit) : "0");

  const handleSave = () => {
    onSave({
      id: insumo.id,
      nombre,
      unidad,
      stock: parseFloat(stock),
      minimo: parseFloat(minimo),
      costoUnit: parseFloat(costoUnit),
    });
  };

  return (
    <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={onCancel}>
      <div className="modal-card" style={S.modalCardWide} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailHeader}>
          <div style={S.modalTitle}>{isNew ? "Nuevo insumo" : "Editar insumo"}</div>
          <button onClick={onCancel} style={S.closeX}><X size={18} /></button>
        </div>

        <div style={S.formField}>
          <label style={S.formLabel}>Nombre</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} style={S.formInput} placeholder="Ej: Pan pretzel artesanal" />
        </div>

        <div style={S.formRow}>
          <div style={{ ...S.formField, flex: 1 }}>
            <label style={S.formLabel}>Unidad</label>
            <select value={unidad} onChange={(e) => setUnidad(e.target.value)} style={S.formInput}>
              <option value="unid">unid</option>
              <option value="porción">porción</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">l</option>
            </select>
          </div>
          <div style={{ ...S.formField, flex: 1 }}>
            <label style={S.formLabel}>Costo unitario</label>
            <MoneyInput value={costoUnit} onChange={setCostoUnit} style={S.formInput} />
          </div>
        </div>

        <div style={S.formRow}>
          {isNew && (
            <div style={{ ...S.formField, flex: 1 }}>
              <label style={S.formLabel}>Stock inicial</label>
              <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} style={S.formInput} />
            </div>
          )}
          <div style={{ ...S.formField, flex: 1 }}>
            <label style={S.formLabel}>Stock mínimo</label>
            <input type="number" value={minimo} onChange={(e) => setMinimo(e.target.value)} style={S.formInput} />
          </div>
        </div>

        {!isNew && (
          <div style={S.stockLockNote}>
            🔒 El stock no se edita desde aquí. Usa <b>Reabastecer</b> o <b>Ajustar</b> en la fila del insumo —
            esas acciones quedan registradas en la bitácora.
          </div>
        )}

        <div style={S.modalActions}>
          <button onClick={onCancel} style={S.modalCancel}>Cancelar</button>
          <button onClick={handleSave} style={S.modalConfirm}>
            <Check size={18} /> {isNew ? "Agregar insumo" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div></ModalPortal>
  );
}

function StatCard({ icon: Icon, label, value, color, alert }) {
  return (
    <div style={{ ...S.statCard, ...(alert ? { borderColor: "#E8B4AE", background: "#FDF1EF" } : {}) }}>
      <div style={{ ...S.statIcon, background: color + "1A", color }}>
        <Icon size={20} strokeWidth={2.2} />
      </div>
      <div>
        <div style={S.statValue}>{value}</div>
        <div style={S.statLabel}>{label}</div>
      </div>
    </div>
  );
}

// ============================================================
// CAJA
// ============================================================
// Campo de dinero: muestra "$ 50.000" mientras se escribe; el valor que guarda son solo los dígitos ("50000").
function MoneyInput({ value, onChange, placeholder, style, autoFocus, onKeyDown, disabled }) {
  const n = value === "" || value == null ? NaN : Math.round(Number(value));
  const mostrado = isNaN(n) ? "" : "$ " + n.toLocaleString("es-CL");
  return (
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      value={mostrado}
      onKeyDown={onKeyDown}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      style={style}
    />
  );
}

function CajaView({ store, showToast, isMobile }) {
  const [efectivoInicial, setEfectivoInicial] = useState("");
  const [nombreCajero, setNombreCajero] = useState("");
  const [showCierre, setShowCierre] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState("");
  const [showMovModal, setShowMovModal] = useState(null); // 'ingreso' | 'retiro'
  const [movMonto, setMovMonto] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [detalleCierre, setDetalleCierre] = useState(null); // cierre completo (con ventasTurno/movsTurno) siendo revisado
  const [reportePrint, setReportePrint] = useState(null); // {tipo:'caja'|'ventas', cierre} listo para imprimir/exportar a PDF

  const cajaAbierta = store.cajaAbierta;

  const isToday = (ts) => !!ts && localDateStr(new Date(ts)) === todayStr();
  // fechaPagoDe ahora es un helper global (ver arriba) — se reutiliza también en Finanzas.

  // Para efectos de caja usamos la fecha en que se COBRÓ el dinero, no la fecha de la venta.
  // Así, una cuenta pendiente de hace días que se cobra hoy sí entra al efectivo de hoy,
  // y una venta de hoy que quedó pendiente no infla el efectivo esperado hasta que se cobre.
  const ventasHoyAll = store.ventas.filter((v) => !v.anulada && v.metodoPago !== "pendiente" && isToday(fechaPagoDe(v)));
  const ventasHoy = ventasHoyAll.filter((v) => v.tipoVenta !== "interno");
  const internoHoy = ventasHoyAll.filter((v) => v.tipoVenta === "interno");
  const totalVentasHoy = ventasHoy.reduce((s, v) => s + v.total, 0);
  const ventasEfectivo = ventasHoy.reduce((s, v) => s + montoPorMetodo(v, "efectivo"), 0);
  const ventasTarjeta = ventasHoy.reduce((s, v) => s + montoPorMetodo(v, "tarjeta"), 0); // se conserva por compatibilidad con ventas históricas
  const ventasTransfer = ventasHoy.reduce((s, v) => s + montoPorMetodo(v, "transferencia"), 0);
  const totalInternoHoy = internoHoy.reduce((s, v) => s + v.total, 0);

  const pendientesActivas = store.ventas.filter((v) => v.metodoPago === "pendiente" && !v.anulada);
  const totalPendienteGlobal = pendientesActivas.reduce((s, v) => s + v.total, 0);

  const movsHoy = store.movimientosCaja.filter((m) => m.fecha === todayStr());
  const ingresosManual = movsHoy.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const retirosManual = movsHoy.filter((m) => m.tipo === "retiro").reduce((s, m) => s + m.monto, 0);

  const efectivoEsperado = cajaAbierta
    ? cajaAbierta.efectivoInicial + ventasEfectivo + ingresosManual - retirosManual
    : 0;

  const abrirCaja = () => {
    const monto = parseFloat(efectivoInicial);
    if (isNaN(monto) || monto < 0) { showToast("Ingresa un monto válido", "error"); return; }
    if (!nombreCajero.trim()) { showToast("Escribe el nombre del cajero del turno", "error"); return; }
    store.saveCaja({ fecha: todayStr(), efectivoInicial: monto, abiertaTs: Date.now(), cajero: nombreCajero.trim() });
    setEfectivoInicial("");
    setNombreCajero("");
    showToast("Caja abierta correctamente");
  };

  const registrarMov = () => {
    const monto = parseFloat(movMonto);
    if (isNaN(monto) || monto <= 0) { showToast("Monto inválido", "error"); return; }
    const mov = { id: uid(), tipo: showMovModal, monto, motivo: movMotivo || "Sin especificar", fecha: todayStr(), ts: Date.now() };
    store.saveMovs([...store.movimientosCaja, mov]);
    setShowMovModal(null);
    setMovMonto("");
    setMovMotivo("");
    showToast(showMovModal === "ingreso" ? "Ingreso registrado" : "Retiro registrado");
  };

  const cerrarCaja = () => {
    const contado = parseFloat(efectivoContado);
    if (isNaN(contado)) { showToast("Ingresa el efectivo contado", "error"); return; }
    const diferencia = contado - efectivoEsperado;
    const cierre = {
      id: uid(),
      fecha: todayStr(),
      abiertaTs: cajaAbierta.abiertaTs,
      cerradaTs: Date.now(),
      efectivoInicial: cajaAbierta.efectivoInicial,
      cajero: cajaAbierta.cajero || null,
      ventasTotal: totalVentasHoy,
      ventasEfectivo,
      ventasTarjeta,
      ventasTransfer,
      ingresosManual,
      retirosManual,
      totalInterno: totalInternoHoy,
      numInterno: internoHoy.length,
      efectivoEsperado,
      efectivoContado: contado,
      diferencia,
      numVentas: ventasHoy.length,
    };
    // snapshot completo del turno para poder revisarlo y exportarlo después:
    // incluye ventas CREADAS en el turno + cuentas pendientes antiguas COBRADAS durante el turno
    const ventasTurno = store.ventas
      .filter((v) => {
        const creadaEnTurno = v.ts >= cajaAbierta.abiertaTs && v.ts <= cierre.cerradaTs;
        const cobradaEnTurno = v.pagadoEn && v.pagadoEn !== v.ts && v.pagadoEn >= cajaAbierta.abiertaTs && v.pagadoEn <= cierre.cerradaTs;
        return creadaEnTurno || cobradaEnTurno;
      })
      .sort((a, b) => a.ts - b.ts);
    const movsTurno = store.movimientosCaja
      .filter((m) => m.ts >= cajaAbierta.abiertaTs && m.ts <= cierre.cerradaTs)
      .sort((a, b) => a.ts - b.ts);
    const cierreCompleto = { ...cierre, ventasTurno, movsTurno };

    store.saveCierres([...store.cierres, cierreCompleto]);
    store.saveCaja(null);
    setShowCierre(false);
    setEfectivoContado("");
    setDetalleCierre(cierreCompleto);
    showToast(
      Math.abs(diferencia) < 1 ? "Caja cerrada · cuadre perfecto ✓" : `Caja cerrada · diferencia ${CLP(diferencia)}`,
      Math.abs(diferencia) > 500 ? "error" : "ok"
    );
  };

  const abrirReportePDF = (tipo, cierre) => {
    setReportePrint({ tipo, cierre });
    setTimeout(() => window.print(), 80);
  };

  if (!cajaAbierta) {
    return (
      <div style={S.cajaClosedWrap}>
        <div style={S.cajaClosedCard}>
          <div style={S.cajaClosedIcon}><Wallet size={30} color="#822D1B" /></div>
          <div style={S.cajaClosedTitle}>La caja está cerrada</div>
          {!store.esConsulta && (
            <>
              <div style={S.cajaClosedSub}>Ingresa el efectivo inicial para comenzar el turno</div>
              <input
                type="text"
                placeholder="Nombre del cajero"
                value={nombreCajero}
                onChange={(e) => setNombreCajero(e.target.value)}
                style={{ ...S.cajaInput, marginBottom: 10 }}
              />
              <MoneyInput
                placeholder="Monto inicial (ej: $ 50.000)"
                value={efectivoInicial}
                onChange={setEfectivoInicial}
                style={S.cajaInput}
              />
              <button onClick={abrirCaja} style={S.cajaOpenBtn}>Abrir caja</button>
            </>
          )}
          {store.esConsulta && (
            <div style={{ ...S.cajaClosedSub, marginBottom: 0 }}>Aún no se ha abierto la caja en el local</div>
          )}
          {pendientesActivas.length > 0 && (
            <div style={{ ...S.pendientesBanner, cursor: "default", width: "100%", marginTop: 18, marginBottom: 0 }}>
              <div style={S.pendientesBannerLeft}>
                <Clock size={18} />
                <span>{pendientesActivas.length} cuenta{pendientesActivas.length === 1 ? "" : "s"} por cobrar</span>
              </div>
              <span style={S.pendientesBannerTotal}>{CLP(totalPendienteGlobal)}</span>
            </div>
          )}
          {store.cierres.length > 0 && <HistorialCierres cierres={store.cierres} onSelect={setDetalleCierre} />}
        </div>

        <CierreDetailModal cierre={detalleCierre} onClose={() => setDetalleCierre(null)} onExportPDF={(tipo) => abrirReportePDF(tipo, detalleCierre)} />
        <ReportePrintArea reporte={reportePrint} />
      </div>
    );
  }

  return (
    <div>
      <div className="stats-row" style={S.statsRow}>
        <StatCard icon={DollarSign} label="Ventas de hoy" value={CLP(totalVentasHoy)} color="#822D1B" />
        <StatCard icon={ReceiptText} label="N° de ventas" value={ventasHoy.length} color="#8A756D" />
        <StatCard icon={Wallet} label="Efectivo esperado en caja" value={CLP(efectivoEsperado)} color="#2E9E5B" />
      </div>

      <div style={S.cajaBreakdown}>
        <div style={S.breakdownTitle}>Desglose del turno</div>
        {cajaAbierta.cajero && <BreakRow label="Cajero" value={cajaAbierta.cajero} />}
        <BreakRow label="Efectivo inicial" value={CLP(cajaAbierta.efectivoInicial)} />
        <BreakRow label="Ventas en efectivo" value={CLP(ventasEfectivo)} positive />
        {ventasTarjeta > 0 && <BreakRow label="Ventas con tarjeta" value={CLP(ventasTarjeta)} />}
        <BreakRow label="Ventas por transferencia" value={CLP(ventasTransfer)} />
        {ingresosManual > 0 && <BreakRow label="Ingresos manuales" value={CLP(ingresosManual)} positive />}
        {retirosManual > 0 && <BreakRow label="Retiros manuales" value={"-" + CLP(retirosManual)} negative />}
        {totalInternoHoy > 0 && (
          <BreakRow label={`Consumo interno hoy (${internoHoy.length}) — no afecta caja`} value={CLP(totalInternoHoy)} />
        )}
        <div style={S.breakdownDivider} />
        <BreakRow label="Efectivo esperado en caja" value={CLP(efectivoEsperado)} bold />
      </div>

      {pendientesActivas.length > 0 && (
        <div style={{ ...S.pendientesBanner, cursor: "default" }}>
          <div style={S.pendientesBannerLeft}>
            <Clock size={18} />
            <span>{pendientesActivas.length} cuenta{pendientesActivas.length === 1 ? "" : "s"} por cobrar en total — revísalas en Historial</span>
          </div>
          <span style={S.pendientesBannerTotal}>{CLP(totalPendienteGlobal)}</span>
        </div>
      )}

      {!store.esConsulta && (
        <div className="caja-actions" style={S.cajaActions}>
          <button onClick={() => setShowMovModal("ingreso")} style={S.movBtnIn}>
            <TrendingUp size={17} /> Registrar ingreso
          </button>
          <button onClick={() => setShowMovModal("retiro")} style={S.movBtnOut}>
            <TrendingDown size={17} /> Registrar retiro
          </button>
          <button onClick={() => setShowCierre(true)} style={S.closeCajaBtn}>
            <RotateCcw size={17} /> Cerrar caja
          </button>
        </div>
      )}

      {movsHoy.length > 0 && (
        <div style={S.movList}>
          <div style={S.breakdownTitle}>Movimientos manuales de hoy</div>
          {movsHoy.slice().reverse().map((m) => (
            <div key={m.id} style={S.movRow}>
              <span style={{ color: m.tipo === "ingreso" ? "#2E9E5B" : "#B4443B", fontWeight: 700 }}>
                {m.tipo === "ingreso" ? "+" : "-"}{CLP(m.monto)}
              </span>
              <span style={S.movMotivo}>{m.motivo}</span>
            </div>
          ))}
        </div>
      )}

      {store.cierres.length > 0 && <HistorialCierres cierres={store.cierres} onSelect={setDetalleCierre} />}

      {showMovModal && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setShowMovModal(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>{showMovModal === "ingreso" ? "Registrar ingreso" : "Registrar retiro"}</div>
            <MoneyInput placeholder="Monto ($)" value={movMonto} onChange={setMovMonto} style={S.cajaInput} />
            <input type="text" placeholder="Motivo (opcional)" value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} style={{ ...S.cajaInput, marginTop: 10 }} />
            <div style={S.modalActions}>
              <button onClick={() => setShowMovModal(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={registrarMov} style={S.modalConfirm}><Check size={18} /> Registrar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      {showCierre && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setShowCierre(false)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Cerrar caja</div>
            <div style={S.cierreEsperado}>Efectivo esperado: <b>{CLP(efectivoEsperado)}</b></div>
            <MoneyInput
              autoFocus
              placeholder="Efectivo contado físicamente"
              value={efectivoContado}
              onChange={setEfectivoContado}
              style={S.cajaInput}
            />
            {efectivoContado !== "" && !isNaN(parseFloat(efectivoContado)) && (
              <div style={{
                ...S.diffPreview,
                color: Math.abs(parseFloat(efectivoContado) - efectivoEsperado) < 1 ? "#2E9E5B" : "#B4443B"
              }}>
                Diferencia: {CLP(parseFloat(efectivoContado) - efectivoEsperado)}
              </div>
            )}
            <div style={S.modalActions}>
              <button onClick={() => setShowCierre(false)} style={S.modalCancel}>Cancelar</button>
              <button onClick={cerrarCaja} style={S.modalConfirm}><Check size={18} /> Confirmar cierre</button>
            </div>
          </div>
        </div></ModalPortal>
      )}

      <CierreDetailModal cierre={detalleCierre} onClose={() => setDetalleCierre(null)} onExportPDF={(tipo) => abrirReportePDF(tipo, detalleCierre)} />
      <ReportePrintArea reporte={reportePrint} />
    </div>
  );
}

function BreakRow({ label, value, positive, negative, bold }) {
  return (
    <div style={S.breakRow}>
      <span style={S.breakLabel}>{label}</span>
      <span style={{
        ...S.breakValue,
        color: positive ? "#2E9E5B" : negative ? "#B4443B" : bold ? "#3A241E" : "#5A4A43",
        fontWeight: bold ? 800 : 600,
        fontSize: bold ? 18 : 14.5,
      }}>{value}</span>
    </div>
  );
}

function HistorialCierres({ cierres, onSelect }) {
  const ultima = cierres.length ? cierres[cierres.length - 1].fecha : todayStr();
  const [mes, setMes] = useState(String(ultima).slice(0, 7)); // "YYYY-MM"
  const [dia, setDia] = useState(null);
  const porFecha = {};
  cierres.forEach((c) => { (porFecha[c.fecha] = porFecha[c.fecha] || []).push(c); });
  const [yy, mm] = mes.split("-").map(Number);
  const cambiarMes = (d) => {
    const dt = new Date(yy, mm - 1 + d, 1);
    setMes(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
    setDia(null);
  };
  const primerDiaSem = (new Date(yy, mm - 1, 1).getDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(yy, mm, 0).getDate();
  const celdas = [];
  for (let i = 0; i < primerDiaSem; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) celdas.push(`${mes}-${String(d).padStart(2, "0")}`);
  const nombreMes = new Date(yy, mm - 1, 1).toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const listaMes = cierres.filter((c) => String(c.fecha).startsWith(mes) && (!dia || c.fecha === dia)).slice().reverse();
  return (
    <div style={S.historyBlock}>
      <div style={S.breakdownTitle}>Historial de cierres ({cierres.length} en total)</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0" }}>
        <button onClick={() => cambiarMes(-1)} style={S.historyRowBtn}><ChevronRight size={16} style={{ transform: "rotate(180deg)" }} /></button>
        <div style={{ fontWeight: 800, textTransform: "capitalize" }}>{nombreMes}</div>
        <button onClick={() => cambiarMes(1)} style={S.historyRowBtn}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 10 }}>
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: COLORS.muted }}>{d}</div>
        ))}
        {celdas.map((f, i) => {
          if (!f) return <div key={i} />;
          const hay = !!porFecha[f];
          const sel = dia === f;
          return (
            <button
              key={f}
              disabled={!hay}
              onClick={() => setDia(sel ? null : f)}
              style={{
                padding: "10px 0", borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: hay ? "pointer" : "default",
                border: `1.5px solid ${sel ? COLORS.redDark : hay ? COLORS.red : COLORS.border}`,
                background: sel ? COLORS.red : hay ? COLORS.redSoft : "#fff",
                color: sel ? "#fff" : hay ? COLORS.redDark : COLORS.muted, opacity: hay ? 1 : 0.5,
              }}
            >
              {Number(f.slice(8))}
            </button>
          );
        })}
      </div>
      {listaMes.length === 0 && <div style={S.historySub}>No hay cierres {dia ? "ese día" : "este mes"}.</div>}
      {listaMes.map((c) => (
        <button key={c.id} onClick={() => onSelect && onSelect(c)} style={S.historyRowBtn}>
          <div>
            <div style={S.historyDate}>{c.fecha}</div>
            <div style={S.historySub}>{c.numVentas} ventas · {CLP(c.ventasTotal)}</div>
          </div>
          <div style={S.historyRight}>
            <div style={{
              ...S.historyDiff,
              color: Math.abs(c.diferencia) < 1 ? "#2E9E5B" : "#B4443B"
            }}>
              {Math.abs(c.diferencia) < 1 ? "Cuadre ✓" : (c.diferencia > 0 ? "+" : "") + CLP(c.diferencia)}
            </div>
            <ChevronRight size={16} color={COLORS.muted} />
          </div>
        </button>
      ))}
    </div>
  );
}

// ---- Detalle de cierre (post-cierre o desde historial) ----
function CierreDetailModal({ cierre, onClose, onExportPDF }) {
  if (!cierre) return null;
  const ventasTurno = cierre.ventasTurno || [];
  const movsTurno = cierre.movsTurno || [];
  return (
    <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={onClose}>
      <div className="modal-card" style={S.modalCardWide} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailHeader}>
          <div>
            <div style={S.modalTitle}>Cierre del {cierre.fecha}</div>
            <div style={S.detailMeta}>
              {fullDateTime(cierre.abiertaTs)} → {fullDateTime(cierre.cerradaTs)} · {ventasTurno.length} venta(s)
            </div>
          </div>
          <button onClick={onClose} style={S.closeX}><X size={18} /></button>
        </div>

        <div style={{
          ...S.diffPreview,
          marginBottom: 16,
          color: Math.abs(cierre.diferencia) < 1 ? "#2E9E5B" : "#B4443B",
        }}>
          {Math.abs(cierre.diferencia) < 1
            ? "Cuadre perfecto ✓"
            : `Diferencia de ${CLP(cierre.diferencia)}`}
        </div>

        <div style={S.cajaBreakdown2}>
          {cierre.cajero && <BreakRow label="Cajero" value={cierre.cajero} />}
          <BreakRow label="Efectivo inicial" value={CLP(cierre.efectivoInicial)} />
          <BreakRow label="Ventas en efectivo" value={CLP(cierre.ventasEfectivo)} positive />
          {cierre.ventasTarjeta > 0 && <BreakRow label="Ventas con tarjeta" value={CLP(cierre.ventasTarjeta)} />}
          <BreakRow label="Ventas por transferencia" value={CLP(cierre.ventasTransfer)} />
          {cierre.ingresosManual > 0 && <BreakRow label="Ingresos manuales" value={CLP(cierre.ingresosManual)} positive />}
          {cierre.retirosManual > 0 && <BreakRow label="Retiros manuales" value={"-" + CLP(cierre.retirosManual)} negative />}
          {cierre.totalInterno > 0 && <BreakRow label={`Consumo interno (${cierre.numInterno || 0})`} value={CLP(cierre.totalInterno)} />}
          <div style={S.breakdownDivider} />
          <BreakRow label="Efectivo esperado" value={CLP(cierre.efectivoEsperado)} bold />
          <BreakRow label="Efectivo contado" value={CLP(cierre.efectivoContado)} bold />
        </div>

        {ventasTurno.length > 0 && (
          <div style={S.turnoVentasList}>
            <div style={S.breakdownTitle}>Ventas del turno</div>
            {ventasTurno.map((v) => (
              <div key={v.id} style={S.turnoVentaRow}>
                <div style={S.turnoVentaLeft}>
                  <span style={{ fontWeight: 700, color: v.anulada ? COLORS.muted : COLORS.ink, textDecoration: v.anulada ? "line-through" : "none" }}>
                    {v.tipoVenta === "interno" ? `Interno · ${v.socioInterno}` : (v.nombreCliente || "Sin nombre")}
                  </span>
                  <span style={S.turnoVentaSub}>{v.hora} · {v.items.reduce((s, it) => s + it.cant, 0)} ítem(s)</span>
                </div>
                <span style={{ fontWeight: 800, color: v.anulada ? COLORS.muted : COLORS.ink }}>{CLP(v.total)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={S.exportLabel}>Exportar este reporte</div>
        <div className="export-row" style={S.exportRow}>
          <button onClick={() => exportarCierreCSV(cierre)} style={S.exportBtn}>📄 Caja (CSV)</button>
          <button onClick={() => exportarVentasCSV(cierre)} style={S.exportBtn}>🧾 Ventas (CSV)</button>
        </div>
        <div className="export-row" style={S.exportRow}>
          <button onClick={() => onExportPDF("caja")} style={S.exportBtnPdf}>📄 Caja (PDF)</button>
          <button onClick={() => onExportPDF("ventas")} style={S.exportBtnPdf}>🧾 Ventas (PDF)</button>
        </div>

        <button onClick={onClose} style={{ ...S.modalCancel, width: "100%", marginTop: 4 }}>Cerrar</button>
      </div>
    </div></ModalPortal>
  );
}

// ---- Área de impresión para exportar reportes a PDF (vía diálogo de impresión del navegador) ----
function ReportePrintArea({ reporte }) {
  if (!reporte || !reporte.cierre) return null;
  const { tipo, cierre } = reporte;
  const ventasTurno = cierre.ventasTurno || [];
  const movsTurno = cierre.movsTurno || [];

  return (
    <div id="reporte-print-area" style={{ display: "none" }}>
      <div style={{ fontFamily: "'Inter', Arial, sans-serif", color: "#000", padding: "10mm", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "3px solid #000", paddingBottom: 10, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>GORDO PIZZERÍA</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#444" }}>
              {tipo === "caja" ? "Reporte de cierre de caja" : "Reporte de ventas del turno"}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: "#444" }}>
            <div>{cierre.fecha}</div>
            <div>{fullDateTime(cierre.abiertaTs)} → {fullDateTime(cierre.cerradaTs)}</div>
          </div>
        </div>

        {tipo === "caja" ? (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {[
                  ["Efectivo inicial", CLP(cierre.efectivoInicial)],
                  ["Ventas en efectivo", CLP(cierre.ventasEfectivo)],
                  ["Ventas con tarjeta", CLP(cierre.ventasTarjeta)],
                  ["Ventas por transferencia", CLP(cierre.ventasTransfer)],
                  ["Total ventas (clientes)", CLP(cierre.ventasTotal)],
                  ["N° de ventas", cierre.numVentas],
                  ["Consumo interno (referencia)", CLP(cierre.totalInterno || 0)],
                  ["N° de consumos internos", cierre.numInterno || 0],
                  ["Ingresos manuales", CLP(cierre.ingresosManual)],
                  ["Retiros manuales", CLP(cierre.retirosManual)],
                ].map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "7px 4px", color: "#333" }}>{label}</td>
                    <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 700 }}>{val}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid #000" }}>
                  <td style={{ padding: "9px 4px", fontWeight: 800 }}>Efectivo esperado</td>
                  <td style={{ padding: "9px 4px", textAlign: "right", fontWeight: 800 }}>{CLP(cierre.efectivoEsperado)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "7px 4px", fontWeight: 800 }}>Efectivo contado</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 800 }}>{CLP(cierre.efectivoContado)}</td>
                </tr>
                <tr>
                  <td style={{ padding: "7px 4px", fontWeight: 900 }}>Diferencia</td>
                  <td style={{ padding: "7px 4px", textAlign: "right", fontWeight: 900 }}>{CLP(cierre.diferencia)}</td>
                </tr>
              </tbody>
            </table>

            {movsTurno.length > 0 && (
              <>
                <div style={{ fontSize: 14, fontWeight: 800, margin: "20px 0 8px" }}>Movimientos manuales del turno</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #000" }}>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Hora</th>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Tipo</th>
                      <th style={{ textAlign: "right", padding: "6px 4px" }}>Monto</th>
                      <th style={{ textAlign: "left", padding: "6px 4px" }}>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movsTurno.map((m) => (
                      <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "6px 4px" }}>{fullDateTime(m.ts)}</td>
                        <td style={{ padding: "6px 4px" }}>{m.tipo === "ingreso" ? "Ingreso" : "Retiro"}</td>
                        <td style={{ padding: "6px 4px", textAlign: "right" }}>{CLP(m.monto)}</td>
                        <td style={{ padding: "6px 4px" }}>{m.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #000" }}>
                  <th style={{ textAlign: "left", padding: "6px 4px" }}>N°</th>
                  <th style={{ textAlign: "left", padding: "6px 4px" }}>Hora</th>
                  <th style={{ textAlign: "left", padding: "6px 4px" }}>Cliente / Tipo</th>
                  <th style={{ textAlign: "left", padding: "6px 4px" }}>Productos</th>
                  <th style={{ textAlign: "right", padding: "6px 4px" }}>Total</th>
                  <th style={{ textAlign: "left", padding: "6px 4px" }}>Pago</th>
                  <th style={{ textAlign: "left", padding: "6px 4px" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ventasTurno.map((v) => (
                  <tr key={v.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "6px 4px", fontWeight: 700 }}>{v.numeroPedido ?? "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{v.hora}</td>
                    <td style={{ padding: "6px 4px" }}>
                      {v.tipoVenta === "interno" ? `Interno — ${v.socioInterno}` : (v.nombreCliente || "Sin nombre")}
                    </td>
                    <td style={{ padding: "6px 4px" }}>{v.items.map((it) => `${it.cant}x ${it.nombre}`).join(", ")}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700 }}>{CLP(v.total)}</td>
                    <td style={{ padding: "6px 4px" }}>{labelMetodoPago(v)}</td>
                    <td style={{ padding: "6px 4px" }}>{v.anulada ? "Anulada" : v.metodoPago === "pendiente" ? "Pendiente" : v.editada ? "Editada" : "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: "right", marginTop: 14, fontSize: 14, fontWeight: 900, borderTop: "2px solid #000", paddingTop: 8 }}>
              Total neto del turno: {CLP(ventasTurno.filter((v) => !v.anulada && v.tipoVenta !== "interno" && v.metodoPago !== "pendiente").reduce((s, v) => s + v.total, 0))}
            </div>
          </>
        )}

        <div style={{ marginTop: 30, fontSize: 10, color: "#999", textAlign: "center" }}>
          Generado por el sistema de gestión de Gordo Pizzería — {new Date().toLocaleString("es-CL")}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// REPORTES
// ============================================================
function ReportesView({ store, isMobile }) {
  const [range, setRange] = useState(7); // días
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [confirmCorregir, setConfirmCorregir] = useState(false);
  const [fechaAbierta, setFechaAbierta] = useState(null);

  const now = Date.now();
  const cutoff = now - range * 24 * 60 * 60 * 1000;
  const ventasRangoAll = store.ventas.filter((v) => v.ts >= cutoff && !v.anulada);
  const ventasRango = ventasRangoAll.filter((v) => v.tipoVenta !== "interno");
  const internoRango = ventasRangoAll.filter((v) => v.tipoVenta === "interno");

  const totalVentas = ventasRango.reduce((s, v) => s + v.total, 0);
  const numVentas = ventasRango.length;
  const ticketProm = numVentas ? totalVentas / numVentas : 0;

  const pendientesRango = ventasRango.filter((v) => v.metodoPago === "pendiente");
  const totalPendienteRango = pendientesRango.reduce((s, v) => s + v.total, 0);

  const costoDeItems = (items) => costoDeVenta(items, store.menu, store.insumos);

  // costo de insumos vendidos a clientes (COGS)
  let costoTotal = 0;
  const productCount = {};
  const productValue = {};
  for (const v of ventasRango) {
    for (const it of v.items) {
      productCount[it.itemId] = (productCount[it.itemId] || 0) + it.cant;
      productValue[it.itemId] = (productValue[it.itemId] || 0) + it.precio * it.cant;
    }
    costoTotal += costoDeItems(v.items);
  }
  const gananciaBruta = totalVentas - costoTotal;
  const margen = totalVentas ? (gananciaBruta / totalVentas) * 100 : 0;

  // costo de consumo interno, desglosado por persona/rol
  const costoInternoPorSocio = Object.fromEntries(store.consumoInterno.map((s) => [s, 0]));
  let costoInternoTotal = 0;
  for (const v of internoRango) {
    const c = costoDeItems(v.items);
    costoInternoTotal += c;
    const quien = v.socioInterno || "Sin asignar";
    // Si el nombre ya no está en la lista (por un cambio antiguo), igual se contabiliza
    costoInternoPorSocio[quien] = (costoInternoPorSocio[quien] || 0) + c;
  }

  const topProducts = Object.entries(productCount)
    .map(([id, cant]) => ({ item: store.menu.find((m) => m.id === id), cant }))
    .filter((p) => p.item)
    .sort((a, b) => b.cant - a.cant)
    .slice(0, 6);

  const maxCant = topProducts[0]?.cant || 1;

  const resumenProductos = Object.entries(productValue)
    .map(([id, valor]) => ({ item: store.menu.find((m) => m.id === id), cant: productCount[id] || 0, valor }))
    .filter((p) => p.item)
    .sort((a, b) => b.valor - a.valor);

  // Productos vendidos por fecha: para cada día del rango, qué se vendió y cuánto
  const ventasPorFecha = {};
  for (const v of ventasRango) {
    const f = v.fecha;
    if (!ventasPorFecha[f]) ventasPorFecha[f] = { productos: {}, totalUnidades: 0, totalValor: 0 };
    for (const it of v.items) {
      if (!ventasPorFecha[f].productos[it.itemId]) {
        ventasPorFecha[f].productos[it.itemId] = { nombre: it.nombre, cant: 0, valor: 0 };
      }
      ventasPorFecha[f].productos[it.itemId].cant += it.cant;
      ventasPorFecha[f].productos[it.itemId].valor += it.precio * it.cant;
      ventasPorFecha[f].totalUnidades += it.cant;
      ventasPorFecha[f].totalValor += it.precio * it.cant;
    }
  }
  const fechasOrdenadas = Object.entries(ventasPorFecha)
    .map(([fecha, data]) => ({
      fecha,
      productos: Object.values(data.productos).sort((a, b) => b.cant - a.cant),
      totalUnidades: data.totalUnidades,
      totalValor: data.totalValor,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha)); // más reciente primero

  // ventas por día para mini-chart
  const days = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = localDateStr(d);
    const total = store.ventas.filter((v) => v.fecha === key && !v.anulada && v.tipoVenta !== "interno").reduce((s, v) => s + v.total, 0);
    days.push({ key, label: d.toLocaleDateString("es-CL", { weekday: "short" }), total });
  }
  const maxDay = Math.max(...days.map((d) => d.total), 1);

  // Detecta cuántos registros tienen el campo "fecha" desincronizado de su fecha local real
  // (esto pasaba en ventas hechas de noche, por un bug de zona horaria ya corregido para ventas nuevas).
  const ventasDesfasadas = store.ventas.filter((v) => v.fecha !== localDateStr(new Date(v.ts))).length;
  const cierresDesfasados = store.cierres.filter((c) => c.fecha !== localDateStr(new Date(c.abiertaTs))).length;
  const movsDesfasados = store.movimientosCaja.filter((m) => m.fecha !== localDateStr(new Date(m.ts))).length;
  const totalDesfasados = ventasDesfasadas + cierresDesfasados + movsDesfasados;

  const corregirFechas = () => {
    setCorrigiendo(true);
    const nextVentas = store.ventas.map((v) => ({ ...v, fecha: localDateStr(new Date(v.ts)) }));
    store.saveVentas(nextVentas);
    const nextCierres = store.cierres.map((c) => ({ ...c, fecha: localDateStr(new Date(c.abiertaTs)) }));
    store.saveCierres(nextCierres);
    const nextMovs = store.movimientosCaja.map((m) => ({ ...m, fecha: localDateStr(new Date(m.ts)) }));
    store.saveMovs(nextMovs);
    setTimeout(() => {
      setCorrigiendo(false);
      setConfirmCorregir(false);
    }, 400);
  };

  return (
    <div>
      <div className="range-row" style={S.rangeRow}>
        {[7, 14, 30].map((r) => (
          <button key={r} onClick={() => setRange(r)} style={{ ...S.rangeBtn, ...(range === r ? S.rangeBtnActive : {}) }}>
            {r} días
          </button>
        ))}
      </div>

      <div className="stats-row" style={S.statsRow}>
        <StatCard icon={DollarSign} label="Ventas totales" value={CLP(totalVentas)} color="#822D1B" />
        <StatCard icon={ReceiptText} label="N° de ventas" value={numVentas} color="#8A756D" />
        <StatCard icon={TrendingUp} label="Ticket promedio" value={CLP(ticketProm)} color="#3A5FA0" />
      </div>
      <div className="stats-row" style={S.statsRow}>
        <StatCard icon={ChefHat} label="Costo de insumos (COGS)" value={CLP(costoTotal)} color="#B4443B" />
        <StatCard icon={CircleDollarSign} label="Ganancia bruta" value={CLP(gananciaBruta)} color="#2E9E5B" />
        <StatCard icon={BarChart3} label="Margen bruto" value={`${margen.toFixed(1)}%`} color="#2E9E5B" />
      </div>
      {totalPendienteRango > 0 && (
        <div className="stats-row" style={S.statsRow}>
          <StatCard icon={Clock} label={`Cuentas por cobrar (${pendientesRango.length})`} value={CLP(totalPendienteRango)} color="#B8860B" />
        </div>
      )}

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Ventas por día</div>
        <div style={S.barsRow}>
          {days.map((d) => (
            <div key={d.key} style={S.barCol}>
              <div style={S.barTrack}>
                <div style={{ ...S.barFill, height: `${Math.max(4, (d.total / maxDay) * 100)}%` }} />
              </div>
              <span style={S.barLabel}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {costoInternoTotal > 0 && (
        <div style={S.chartCard}>
          <div style={S.breakdownTitle}>Consumo interno ({internoRango.length} pedido{internoRango.length === 1 ? "" : "s"})</div>
          <div style={S.internoTotalRow}>
            <span>Costo total en el período</span>
            <span style={S.internoTotalVal}>{CLP(costoInternoTotal)}</span>
          </div>
          {Object.entries(costoInternoPorSocio)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([socio, costo]) => (
            <div key={socio} style={S.topProdRow}>
              <span style={S.topProdName}>{socio}</span>
              <div style={S.topProdBarTrack}>
                <div style={{ ...S.topProdBarFill, width: `${(costo / costoInternoTotal) * 100}%`, background: "#3A5FA0" }} />
              </div>
              <span style={S.topProdCant}>{CLP(costo)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Productos más vendidos</div>
        {topProducts.length === 0 ? (
          <div style={S.emptyState}>Sin ventas en este período todavía</div>
        ) : (
          topProducts.map((p) => (
            <div key={p.item.id} style={S.topProdRow}>
              <span style={S.topProdName}>{p.item.nombre}</span>
              <div style={S.topProdBarTrack}>
                <div style={{ ...S.topProdBarFill, width: `${(p.cant / maxCant) * 100}%` }} />
              </div>
              <span style={S.topProdCant}>{p.cant}</span>
            </div>
          ))
        )}
      </div>

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Qué se vendió cada día</div>
        {fechasOrdenadas.length === 0 ? (
          <div style={S.emptyState}>Sin ventas en este período todavía</div>
        ) : (
          fechasOrdenadas.map((dia) => {
            const abierta = fechaAbierta === dia.fecha;
            const fechaLegible = new Date(dia.fecha + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
            return (
              <div key={dia.fecha} style={S.fechaBloque}>
                <button onClick={() => setFechaAbierta(abierta ? null : dia.fecha)} style={S.fechaHeader}>
                  <div>
                    <div style={S.fechaTitulo}>{fechaLegible}</div>
                    <div style={S.fechaSub}>{dia.totalUnidades} producto{dia.totalUnidades === 1 ? "" : "s"} · {CLP(dia.totalValor)}</div>
                  </div>
                  <span style={S.fechaChevron}>{abierta ? "▲" : "▼"}</span>
                </button>
                {abierta && (
                  <div style={S.fechaDetalle}>
                    {dia.productos.map((p) => (
                      <div key={p.nombre} style={S.fechaProdRow}>
                        <span style={S.fechaProdCant}>{p.cant}×</span>
                        <span style={S.fechaProdNombre}>{p.nombre}</span>
                        <span style={S.fechaProdValor}>{CLP(p.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="table-scroll" style={S.tableCard}>
        <div style={{ padding: "18px 20px 4px" }}>
          <div style={S.breakdownTitle}>Resumen de ventas por producto</div>
        </div>
        {resumenProductos.length === 0 ? (
          <div style={S.emptyState}>Sin ventas en este período todavía</div>
        ) : (
          <>
            <div style={S.tableHead}>
              <span style={{ flex: 2.4 }}>Producto</span>
              <span style={{ flex: 1, textAlign: "right" }}>Cantidad</span>
              <span style={{ flex: 1.3, textAlign: "right" }}>Valor vendido</span>
            </div>
            <div style={S.tableBody}>
              {resumenProductos.map((p) => (
                <div key={p.item.id} style={S.tableRow}>
                  <div style={{ flex: 2.4, fontWeight: 700, color: COLORS.ink }}>{p.item.nombre}</div>
                  <div style={{ flex: 1, textAlign: "right", color: COLORS.inkSoft, fontWeight: 600 }}>{p.cant}</div>
                  <div style={{ flex: 1.3, textAlign: "right", fontWeight: 800, color: COLORS.ink }}>{CLP(p.valor)}</div>
                </div>
              ))}
              <div style={S.tableRowTotal}>
                <div style={{ flex: 2.4, fontWeight: 800, color: COLORS.ink }}>Total</div>
                <div style={{ flex: 1, textAlign: "right", fontWeight: 800, color: COLORS.ink }}>
                  {resumenProductos.reduce((s, p) => s + p.cant, 0)}
                </div>
                <div style={{ flex: 1.3, textAlign: "right", fontWeight: 900, color: COLORS.redDark, fontSize: 15.5 }}>
                  {CLP(resumenProductos.reduce((s, p) => s + p.valor, 0))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {totalDesfasados > 0 && (
        <div style={S.fixDateCard}>
          <div style={S.fixDateHeader}>
            <AlertTriangle size={17} color="#B4271A" />
            <span>Se detectaron {totalDesfasados} registro(s) con la fecha desincronizada</span>
          </div>
          <div style={S.fixDateText}>
            Esto pasó por un bug de zona horaria (ya corregido) que afectaba ventas hechas de noche.
            El dinero y los cálculos de caja están correctos; solo el "día" mostrado en algunos registros
            antiguos puede estar corrido. Esta corrección es segura y no cambia montos, solo ajusta la fecha
            mostrada al día real en que ocurrió cada cosa.
          </div>
          {!confirmCorregir ? (
            <button onClick={() => setConfirmCorregir(true)} style={S.fixDateBtn}>Corregir fechas ahora</button>
          ) : (
            <div style={S.modalActions}>
              <button onClick={() => setConfirmCorregir(false)} style={S.modalCancel}>Cancelar</button>
              <button onClick={corregirFechas} disabled={corrigiendo} style={S.modalConfirm}>
                {corrigiendo ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                {corrigiendo ? "Corrigiendo…" : "Sí, corregir"}
              </button>
            </div>
          )}
        </div>
      )}

      <BackupBlock store={store} />
    </div>
  );
}

function BackupBlock({ store }) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [confirmImport, setConfirmImport] = useState(null); // File pendiente de confirmar
  const inputRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setImportError(null);
    setConfirmImport(f);
  };

  const doImport = async () => {
    setImporting(true);
    try {
      await store.importarRespaldo(confirmImport);
      setConfirmImport(null);
    } catch (e) {
      setImportError("El archivo no es un respaldo válido.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={S.backupCard}>
      <div style={S.backupTitle}>Respaldo y restauración</div>
      <div style={S.backupText}>
        Los datos se guardan en este navegador y se copian a la nube cuando hay internet.
        Como respaldo adicional, exporta un archivo cada cierto tiempo (recomendado: al cerrar caja diaria)
        y guárdalo en Google Drive, Dropbox o similar. Si algo pasa con el PC, puedes recuperar todo importándolo.
      </div>
      <div style={{ margin: "12px 0" }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Espacio usado en la nube por bloque (límite 1 MB por bloque)</div>
        {(() => {
          const datos = store.datosRespaldo();
          return Object.keys(datos).map((k) => {
            let bytes = 0;
            try { bytes = new Blob([JSON.stringify(datos[k] ?? "")]).size; } catch (e) {}
            const pct = Math.min(100, (bytes / 1048576) * 100);
            const col = pct >= 80 ? "#B4271A" : pct >= 50 ? "#D98A00" : "#2E9E5B";
            return (
              <div key={k} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                  <span>{k}</span><span style={{ color: col }}>{(bytes / 1024).toFixed(1)} KB · {pct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 6, background: "#eee", borderRadius: 4 }}>
                  <div style={{ width: pct + "%", height: 6, background: col, borderRadius: 4 }} />
                </div>
              </div>
            );
          });
        })()}
      </div>
      <div className="backup-actions" style={S.backupActions}>
        <button onClick={store.exportarRespaldo} style={S.backupBtn}>
          <Download size={16} /> Exportar respaldo (JSON)
        </button>
        {!store.esConsulta && (
          <button onClick={() => inputRef.current?.click()} style={S.backupBtnImport}>
            <Upload size={16} /> Importar respaldo
          </button>
        )}
        <input ref={inputRef} type="file" accept="application/json" onChange={handleFile} style={{ display: "none" }} />
      </div>
      {importError && <div style={{ color: "#B4271A", fontSize: 12.5, marginTop: 10, fontWeight: 700 }}>{importError}</div>}

      {confirmImport && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => !importing && setConfirmImport(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Restaurar desde este archivo?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 18 }}>
              <b>Se sobrescribirán</b> todos los datos actuales (ventas, cierres, inventario, caja).
              Esta acción no se puede deshacer.
            </div>
            <div style={S.modalActions}>
              <button onClick={() => setConfirmImport(null)} disabled={importing} style={S.modalCancel}>Cancelar</button>
              <button onClick={doImport} disabled={importing} style={S.modalAnularConfirmBtn}>
                {importing ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
                {importing ? "Restaurando…" : "Sí, restaurar"}
              </button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

// ============================================================
// MÓDULO ADMINISTRATIVO
// ============================================================
function AdminView({ store, tab, showToast, isMobile }) {
  if (tab === "productos") return <AdminProductos store={store} showToast={showToast} isMobile={isMobile} />;
  if (tab === "categorias") return <AdminCategorias store={store} showToast={showToast} />;
  if (tab === "personal") return <AdminPersonal store={store} showToast={showToast} />;
  if (tab === "permisos") return <AdminInventario store={store} showToast={showToast} isMobile={isMobile} />;
  if (tab === "alertas") return <AdminAlertas store={store} isMobile={isMobile} />;
  if (tab === "ajustes") return <AdminAjustes store={store} showToast={showToast} />;
  return null;
}

// --- Productos (reutiliza el gestor de productos que ya vivía en Inventario) ---
function AdminProductos({ store, showToast, isMobile }) {
  const [editingProducto, setEditingProducto] = useState(null);
  const [confirmDeleteProd, setConfirmDeleteProd] = useState(null);

  const saveProducto = (data) => {
    if (!data.nombre.trim()) { showToast("El nombre es obligatorio", "error"); return false; }
    const precio = parseFloat(data.precio);
    if (isNaN(precio) || precio < 0) { showToast("Precio inválido", "error"); return false; }
    const costoUnit = data.costoUnit === "" || data.costoUnit == null ? null : (parseFloat(data.costoUnit) || 0);
    const recipe = (data.recipe || []).filter((r) => r.insumoId && r.cant > 0);
    if (data.id) {
      store.saveMenu(store.menu.map((m) => (m.id === data.id ? { ...m, nombre: data.nombre.trim(), precio, costoUnit, desc: data.desc || "", color: data.color || CATEGORIA_POR_DEFECTO, recipe } : m)));
      showToast("Producto actualizado");
    } else {
      const newId = data.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30) + "_" + uid().slice(0, 4);
      store.saveMenu([...store.menu, { id: newId, nombre: data.nombre.trim(), precio, costoUnit, desc: data.desc || "", color: data.color || CATEGORIA_POR_DEFECTO, recipe }]);
      showToast("Producto agregado al menú");
    }
    setEditingProducto(null);
    return true;
  };
  const deleteProducto = (prod) => {
    store.saveMenu(store.menu.filter((m) => m.id !== prod.id));
    setConfirmDeleteProd(null);
    showToast(`${prod.nombre} eliminado del menú`);
  };

  const moverProducto = (index, dir) => {
    const nuevo = [...store.menu];
    const destino = index + dir;
    if (destino < 0 || destino >= nuevo.length) return;
    [nuevo[index], nuevo[destino]] = [nuevo[destino], nuevo[index]];
    store.saveMenu(nuevo);
  };

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Productos del menú</div>
          <div style={S.adminSub}>Agrega, edita o elimina productos y sus precios</div>
        </div>
        <button onClick={() => setEditingProducto({ recipe: [] })} style={S.newInsumoBtn}>
          <Plus size={16} /> Nuevo producto
        </button>
      </div>
      <div style={S.adminSub2}>Usa las flechas para cambiar el orden en que aparecen en el punto de venta.</div>
      <div style={S.productosList}>
        {store.menu.map((prod, index) => (
          <div key={prod.id} style={S.productoRow}>
            <div style={S.ordenBtns}>
              <button onClick={() => moverProducto(index, -1)} disabled={index === 0} style={{ ...S.ordenBtn, ...(index === 0 ? S.ordenBtnDisabled : {}) }} title="Subir">▲</button>
              <button onClick={() => moverProducto(index, 1)} disabled={index === store.menu.length - 1} style={{ ...S.ordenBtn, ...(index === store.menu.length - 1 ? S.ordenBtnDisabled : {}) }} title="Bajar">▼</button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.productoNombre}>{prod.nombre}</div>
              <div style={S.productoMeta}>
                {(() => { const c = store.categorias.find((x) => x.id === prod.color); return c ? `${c.icono} ${c.nombre} · ` : "Sin categoría · "; })()}{CLP(prod.precio)}
                {prod.costoUnit != null && prod.costoUnit !== "" ? (
                  <span style={S.productoMargen}>
                    {" · costo "}{CLP(prod.costoUnit)}{" · "}
                    <b style={{ color: prod.precio - prod.costoUnit >= 0 ? "#2E9E5B" : "#B4271A" }}>
                      {CLP(prod.precio - prod.costoUnit)} ({prod.precio > 0 ? Math.round(((prod.precio - prod.costoUnit) / prod.precio) * 100) : 0}%)
                    </b>
                  </span>
                ) : (
                  <span style={{ color: "#B8860B" }}> · sin costo definido</span>
                )}
              </div>
            </div>
            <div style={S.productoActions}>
              <button onClick={() => setEditingProducto(prod)} style={S.iconActionBtn} title="Editar"><Settings size={13} /></button>
              <button onClick={() => setConfirmDeleteProd(prod)} style={S.iconActionBtnDanger} title="Eliminar"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {editingProducto && (
        <ProductoFormModal producto={editingProducto} insumos={store.insumos} categorias={store.categorias} onCancel={() => setEditingProducto(null)} onSave={saveProducto} />
      )}
      {confirmDeleteProd && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmDeleteProd(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Eliminar "{confirmDeleteProd.nombre}"?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              Ya no aparecerá en el punto de venta. Las ventas antiguas que lo incluyan se conservan.
            </div>
            <div style={S.modalActions}>
              <button onClick={() => setConfirmDeleteProd(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => deleteProducto(confirmDeleteProd)} style={S.modalAnularConfirmBtn}><Trash2 size={17} /> Eliminar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

// --- Categorías de la pantalla de ventas ---
function AdminCategorias({ store, showToast }) {
  const [editando, setEditando] = useState(null); // {id?, nombre, icono}
  const [borrando, setBorrando] = useState(null); // categoría a borrar
  const [destino, setDestino] = useState("");
  const cats = store.categorias;
  const cuenta = (id) => store.menu.filter((m) => m.color === id).length;

  const guardar = () => {
    const nombre = (editando.nombre || "").trim();
    if (!nombre) { showToast("Escribe el nombre de la categoría", "error"); return; }
    if (cats.some((c) => c.id !== editando.id && c.nombre.toLowerCase() === nombre.toLowerCase())) { showToast("Ya existe una categoría con ese nombre", "error"); return; }
    const icono = (editando.icono || "").trim() || "🍽️";
    if (editando.id) {
      store.saveCategorias(cats.map((c) => (c.id === editando.id ? { ...c, nombre, icono } : c)));
      showToast("Categoría actualizada");
    } else {
      const id = nombre.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20) + "_" + uid().slice(0, 4);
      store.saveCategorias([...cats, { id, nombre, icono }]);
      showToast("Categoría creada");
    }
    setEditando(null);
  };
  const mover = (i, d) => {
    const n = [...cats];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    store.saveCategorias(n);
  };
  const borrar = () => {
    const n = cuenta(borrando.id);
    if (n > 0 && !destino) { showToast("Elige a qué categoría mover sus productos", "error"); return; }
    if (n > 0) store.saveMenu(store.menu.map((m) => (m.color === borrando.id ? { ...m, color: destino } : m)));
    store.saveCategorias(cats.filter((c) => c.id !== borrando.id));
    setBorrando(null);
    setDestino("");
    showToast("Categoría eliminada");
  };

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Categorías de ventas</div>
          <div style={S.adminSub}>Los botones de filtro que ve la caja en la pantalla de ventas</div>
        </div>
        <button onClick={() => setEditando({ nombre: "", icono: "🍽️" })} style={S.newInsumoBtn}><Plus size={16} /> Nueva categoría</button>
      </div>
      <div style={S.productosList}>
        {cats.map((c, i) => (
          <div key={c.id} style={S.productoRow}>
            <div style={S.ordenBtns}>
              <button onClick={() => mover(i, -1)} disabled={i === 0} style={{ ...S.ordenBtn, ...(i === 0 ? S.ordenBtnDisabled : {}) }}>▲</button>
              <button onClick={() => mover(i, 1)} disabled={i === cats.length - 1} style={{ ...S.ordenBtn, ...(i === cats.length - 1 ? S.ordenBtnDisabled : {}) }}>▼</button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.productoNombre}>{c.icono} {c.nombre}</div>
              <div style={S.productoMeta}>{cuenta(c.id)} producto{cuenta(c.id) === 1 ? "" : "s"}</div>
            </div>
            <div style={S.productoActions}>
              <button onClick={() => setEditando({ ...c })} style={S.iconActionBtn} title="Editar"><Settings size={13} /></button>
              <button onClick={() => { setBorrando(c); setDestino(""); }} disabled={cats.length <= 1} style={S.iconActionBtnDanger} title="Eliminar"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
      {editando && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setEditando(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>{editando.id ? "Editar categoría" : "Nueva categoría"}</div>
            <label style={S.formLabel}>Nombre</label>
            <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Ej: Combos, Postres, Adicionales" style={S.formInput} />
            <label style={S.formLabel}>Ícono (un emoji)</label>
            <input type="text" value={editando.icono} onChange={(e) => setEditando({ ...editando, icono: e.target.value })} style={S.formInput} />
            <div style={{ ...S.modalActions, marginTop: 16 }}>
              <button onClick={() => setEditando(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={guardar} style={S.modalConfirm}><Check size={18} /> Guardar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
      {borrando && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setBorrando(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Eliminar "{borrando.nombre}"?</div>
            {cuenta(borrando.id) > 0 ? (
              <>
                <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 12 }}>
                  Tiene {cuenta(borrando.id)} producto(s). Elige a qué categoría se mueven (no se borra ningún producto).
                </div>
                <div style={{ ...S.catToggle, flexWrap: "wrap" }}>
                  {cats.filter((c) => c.id !== borrando.id).map((c) => (
                    <button key={c.id} onClick={() => setDestino(c.id)} style={{ ...S.catToggleBtn, ...(destino === c.id ? S.catToggleActive : {}) }}>{c.icono} {c.nombre}</button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>No tiene productos.</div>
            )}
            <div style={S.modalActions}>
              <button onClick={() => setBorrando(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={borrar} style={S.modalAnularConfirmBtn}><Trash2 size={17} /> Eliminar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

// --- Personal (trabajadores + destinatarios de consumo interno) ---
function AdminPersonal({ store, showToast }) {
  const [editando, setEditando] = useState(null); // trabajador o {} para nuevo
  const [confirmDel, setConfirmDel] = useState(null);
  const [nuevoConsumo, setNuevoConsumo] = useState("");
  const [confirmDeleteConsumo, setConfirmDeleteConsumo] = useState(null);

  const guardarTrabajador = (data) => {
    if (!data.nombre.trim()) { showToast("El nombre es obligatorio", "error"); return false; }
    const valorJornal = parseFloat(data.valorJornal) || 0;
    if (data.id) {
      store.savePersonal(store.personal.map((p) => (p.id === data.id ? { ...p, nombre: data.nombre.trim(), rol: data.rol || "", valorJornal, nombreConsumo: data.nombreConsumo || "" } : p)));
      showToast("Trabajador actualizado");
    } else {
      store.savePersonal([...store.personal, { id: uid(), nombre: data.nombre.trim(), rol: data.rol || "", valorJornal, nombreConsumo: data.nombreConsumo || "" }]);
      showToast("Trabajador agregado");
    }
    setEditando(null);
    return true;
  };
  const eliminarTrabajador = (t) => {
    store.savePersonal(store.personal.filter((p) => p.id !== t.id));
    setConfirmDel(null);
    showToast(`${t.nombre} eliminado`);
  };

  const addConsumo = () => {
    const nombre = nuevoConsumo.trim();
    if (!nombre) { showToast("Escribe un nombre o rol", "error"); return; }
    if (store.consumoInterno.some((n) => n.toLowerCase() === nombre.toLowerCase())) { showToast("Ya está en la lista", "error"); return; }
    store.saveConsumoInterno([...store.consumoInterno, nombre]);
    setNuevoConsumo("");
    showToast(`${nombre} agregado`);
  };
  const deleteConsumo = (nombre) => {
    store.saveConsumoInterno(store.consumoInterno.filter((n) => n !== nombre));
    setConfirmDeleteConsumo(null);
    showToast(`${nombre} quitado`);
  };

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Personal</div>
          <div style={S.adminSub}>Trabajadores, sus roles y pago acordado</div>
        </div>
        <button onClick={() => setEditando({ frecuencia: "mensual" })} style={S.newInsumoBtn}>
          <Plus size={16} /> Nuevo trabajador
        </button>
      </div>

      <div style={S.productosList}>
        {store.personal.length === 0 && <div style={S.emptyState}>Aún no has registrado trabajadores</div>}
        {store.personal.map((t) => (
          <div key={t.id} style={S.productoRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.productoNombre}>{t.nombre}</div>
              <div style={S.productoMeta}>{t.rol || "Sin rol"} · jornal {CLP(t.valorJornal || 0)}{t.nombreConsumo ? ` · consume como "${t.nombreConsumo}"` : ""}</div>
            </div>
            <div style={S.productoActions}>
              <button onClick={() => setEditando(t)} style={S.iconActionBtn}><Settings size={13} /></button>
              <button onClick={() => setConfirmDel(t)} style={S.iconActionBtnDanger}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...S.productosSection, marginTop: 28 }}>
        <div style={S.breakdownTitle}>Destinatarios de consumo interno</div>
        <div style={S.consumoHelp}>Quiénes pueden recibir consumo interno al registrar un pedido.</div>
        <div style={S.consumoChips}>
          {store.consumoInterno.map((nombre) => (
            <div key={nombre} style={S.consumoChip}>
              <span>{nombre}</span>
              <button onClick={() => setConfirmDeleteConsumo(nombre)} style={S.consumoChipDel}><X size={13} /></button>
            </div>
          ))}
        </div>
        <div style={S.consumoAddRow}>
          <input type="text" value={nuevoConsumo} onChange={(e) => setNuevoConsumo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addConsumo(); }} placeholder="Nombre o rol" style={{ ...S.formInput, flex: 1, minWidth: 0 }} />
          <button onClick={addConsumo} style={S.newInsumoBtn}><Plus size={16} /> Agregar</button>
        </div>
      </div>

      {editando && <TrabajadorFormModal trabajador={editando} consumoInterno={store.consumoInterno} onCancel={() => setEditando(null)} onSave={guardarTrabajador} />}
      {confirmDel && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmDel(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Eliminar a {confirmDel.nombre}?</div>
            <div style={S.modalActions}>
              <button onClick={() => setConfirmDel(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => eliminarTrabajador(confirmDel)} style={S.modalAnularConfirmBtn}><Trash2 size={17} /> Eliminar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
      {confirmDeleteConsumo && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmDeleteConsumo(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Quitar "{confirmDeleteConsumo}"?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>Los consumos ya registrados se conservan en los reportes.</div>
            <div style={S.modalActions}>
              <button onClick={() => setConfirmDeleteConsumo(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => deleteConsumo(confirmDeleteConsumo)} style={S.modalAnularConfirmBtn}><Trash2 size={17} /> Quitar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

function TrabajadorFormModal({ trabajador, onCancel, onSave, consumoInterno }) {
  const [nombre, setNombre] = useState(trabajador.nombre || "");
  const [rol, setRol] = useState(trabajador.rol || "");
  const [valorJornal, setValorJornal] = useState(trabajador.valorJornal != null ? String(trabajador.valorJornal) : "");
  const [nombreConsumo, setNombreConsumo] = useState(trabajador.nombreConsumo || "");
  const esNuevo = !trabajador.id;
  return (
    <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={onCancel}>
      <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailHeader}>
          <div style={S.modalTitle}>{esNuevo ? "Nuevo trabajador" : "Editar trabajador"}</div>
          <button onClick={onCancel} style={S.closeX}><X size={18} /></button>
        </div>
        <label style={S.formLabel}>Nombre</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" style={S.formInput} />
        <label style={S.formLabel}>Rol</label>
        <input type="text" value={rol} onChange={(e) => setRol(e.target.value)} placeholder="Ej: Pizzero, Cajero" style={S.formInput} />
        <label style={S.formLabel}>Valor del jornal (por día trabajado)</label>
        <MoneyInput value={valorJornal} onChange={setValorJornal} placeholder="Ej: $ 40.000" style={S.formInput} />
        <label style={S.formLabel}>¿A qué nombre carga sus consumos internos?</label>
        <select value={nombreConsumo} onChange={(e) => setNombreConsumo(e.target.value)} style={S.formInput}>
          <option value="">— Sin vincular (no se le descuenta consumo) —</option>
          {(consumoInterno || []).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div style={S.recipeHelp}>Al liquidar la semana, se le restarán los consumos internos hechos a este nombre (a precio de venta).</div>
        <div style={{ ...S.modalActions, marginTop: 18 }}>
          <button onClick={onCancel} style={S.modalCancel}>Cancelar</button>
          <button onClick={() => onSave({ ...trabajador, nombre, rol, valorJornal, nombreConsumo })} style={S.modalConfirm}><Check size={18} /> {esNuevo ? "Crear" : "Guardar"}</button>
        </div>
      </div>
    </div></ModalPortal>
  );
}

// --- Inventario y bitácora (solo lectura de la bitácora + acceso al inventario) ---
function AdminInventario({ store, showToast, isMobile }) {
  const [bitacoraAbierta, setBitacoraAbierta] = useState(true);

  const sorted = [...store.insumos].sort((a, b) => {
    const aLow = a.activo !== false && a.stock <= a.minimo;
    const bLow = b.activo !== false && b.stock <= b.minimo;
    if (aLow !== bLow) return aLow ? -1 : 1;
    return a.nombre.localeCompare(b.nombre);
  });
  const lowCount = store.insumos.filter((i) => i.activo !== false && i.stock <= i.minimo).length;
  const totalValue = store.insumos.reduce((s, i) => s + (i.activo !== false ? i.stock * (i.costoUnit || 0) : 0), 0);

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Inventario y bitácora</div>
          <div style={S.adminSub}>Revisa el stock y cada movimiento registrado</div>
        </div>
      </div>

      <div style={S.avisoInventario}>
        📍 El stock se ajusta desde el módulo <b>Ventas</b>, en el computador de la caja. Aquí lo ves para control, pero no se edita.
      </div>

      <div className="stats-row" style={S.statsRow}>
        <StatCard icon={Boxes} label="Insumos totales" value={store.insumos.length} color="#822D1B" />
        <StatCard icon={AlertTriangle} label="Stock bajo" value={lowCount} color="#B4443B" alert={lowCount > 0} />
        <StatCard icon={CircleDollarSign} label="Valor de inventario" value={CLP(totalValue)} color="#2E9E5B" />
      </div>

      <div className="table-scroll" style={S.tableCard}>
        <div style={S.tableHead}>
          <span style={{ flex: 2 }}>Insumo</span>
          <span style={{ flex: 1 }}>Stock</span>
          <span style={{ flex: 0.8 }}>Mínimo</span>
          <span style={{ flex: 1 }}>Costo unit.</span>
        </div>
        <div style={S.tableBody}>
          {sorted.map((ins) => {
            const inactivo = ins.activo === false;
            const low = !inactivo && ins.stock <= ins.minimo;
            return (
              <div key={ins.id} style={{ ...S.tableRow, ...(low ? S.tableRowLow : {}), ...(inactivo ? S.tableRowInactive : {}) }}>
                <div style={{ flex: 2, fontWeight: 600, color: inactivo ? COLORS.muted : "#3A241E" }}>
                  {ins.nombre}
                  {low && <span style={S.lowBadge}>BAJO</span>}
                  {inactivo && <span style={S.inactiveBadge}>INACTIVO</span>}
                </div>
                <div style={{ flex: 1, color: inactivo ? COLORS.muted : "#3A241E" }}>{ins.stock} {ins.unidad}</div>
                <div style={{ flex: 0.8, color: inactivo ? COLORS.muted : "#3A241E" }}>{ins.minimo}</div>
                <div style={{ flex: 1, color: COLORS.muted }}>{CLP(ins.costoUnit)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <BitacoraInventario movs={store.movsInventario} abierto={bitacoraAbierta} onToggle={() => setBitacoraAbierta((v) => !v)} />
    </div>
  );
}

// --- Panel de alertas (señales de posible fraude) ---
function AdminAlertas({ store, isMobile }) {
  const now = Date.now();
  const hace30 = now - 30 * 24 * 60 * 60 * 1000;

  const ventas30 = store.ventas.filter((v) => v.ts >= hace30);
  const anuladas = ventas30.filter((v) => v.anulada);
  const conDescuento = ventas30.filter((v) => v.descuento && !v.anulada);
  const totalDescuentos = conDescuento.reduce((s, v) => s + (v.descuento?.monto || 0), 0);
  const ajustesStock = (store.movsInventario || []).filter((m) => m.tipo === "ajuste" && m.ts >= hace30);
  const ajustesNegativos = ajustesStock.filter((m) => m.delta < 0);

  // Consumo interno por persona en 30 días
  const internoPorPersona = {};
  for (const v of ventas30.filter((v) => v.tipoVenta === "interno" && !v.anulada)) {
    const q = v.socioInterno || "Sin asignar";
    internoPorPersona[q] = (internoPorPersona[q] || 0) + 1;
  }
  const internoOrdenado = Object.entries(internoPorPersona).sort((a, b) => b[1] - a[1]);

  const card = (titulo, valor, detalle, color) => (
    <div style={S.alertaCard}>
      <div style={S.alertaValor(color)}>{valor}</div>
      <div style={S.alertaTitulo}>{titulo}</div>
      {detalle && <div style={S.alertaDetalle}>{detalle}</div>}
    </div>
  );

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Señales de alerta</div>
          <div style={S.adminSub}>Últimos 30 días · revisa lo que se sale de lo normal</div>
        </div>
      </div>

      <div style={{ ...S.statsRow, marginBottom: 20 }} className="stats-row">
        {card("Ventas anuladas", anuladas.length, anuladas.length > 0 ? "Revisa que tengan justificación" : "Todo normal", anuladas.length > 5 ? "#B4271A" : "#2E9E5B")}
        {card("Descuentos aplicados", conDescuento.length, totalDescuentos > 0 ? `${CLP(totalDescuentos)} en total` : "Ninguno", conDescuento.length > 10 ? "#B8860B" : "#2E9E5B")}
        {card("Ajustes de inventario", ajustesNegativos.length, ajustesNegativos.length > 0 ? "Bajas de stock manuales" : "Sin ajustes", ajustesNegativos.length > 3 ? "#B4271A" : "#2E9E5B")}
      </div>

      {conDescuento.length > 0 && (
        <div style={S.chartCard}>
          <div style={S.breakdownTitle}>Descuentos del mes</div>
          {conDescuento.slice(0, 15).map((v) => (
            <div key={v.id} style={S.alertaRow}>
              <span style={{ fontWeight: 700 }}>{v.nombreCliente || "Sin nombre"} · #{v.numeroPedido}</span>
              <span style={{ color: "#B4271A", fontWeight: 700 }}>− {CLP(v.descuento.monto)}</span>
              <span style={{ fontSize: 12, color: COLORS.muted, flexBasis: "100%" }}>{v.descuento.motivo}</span>
            </div>
          ))}
        </div>
      )}

      {internoOrdenado.length > 0 && (
        <div style={S.chartCard}>
          <div style={S.breakdownTitle}>Consumo interno por persona (30 días)</div>
          {internoOrdenado.map(([nombre, cant]) => (
            <div key={nombre} style={S.alertaRow}>
              <span style={{ fontWeight: 700, flex: 1 }}>{nombre}</span>
              <span style={{ fontWeight: 800 }}>{cant} pedido{cant === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      )}

      {ajustesNegativos.length > 0 && (
        <div style={S.chartCard}>
          <div style={S.breakdownTitle}>Bajas de inventario manuales</div>
          {ajustesNegativos.slice(0, 15).map((m) => (
            <div key={m.id} style={S.alertaRow}>
              <span style={{ fontWeight: 700 }}>{m.insumoNombre}</span>
              <span style={{ color: "#B4271A", fontWeight: 700 }}>{m.delta}</span>
              <span style={{ fontSize: 12, color: COLORS.muted, flexBasis: "100%" }}>{m.motivo} · {fullDateTime(m.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Ajustes y PIN ---
function AdminAjustes({ store, showToast }) {
  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Ajustes y respaldo</div>
          <div style={S.adminSub}>Sesión: {store.email || "admin"} · el acceso ahora se controla con usuario y contraseña de Firebase</div>
        </div>
      </div>
      <BackupBlock store={store} />
    </div>
  );
}

// ============================================================
// MÓDULO FINANCIERO
// ============================================================
function FinancieroView({ store, tab, showToast, isMobile }) {
  if (tab === "resumen") return <FinResumen store={store} isMobile={isMobile} />;
  if (tab === "facturas") return <FinRegistro store={store} showToast={showToast} categoria="gasto" titulo="Facturas y gastos" sub="Compras, servicios, arriendo y otros gastos" />;
  if (tab === "trabajadores") return <FinLiquidacionPersonal store={store} showToast={showToast} isMobile={isMobile} />;
  if (tab === "pedidos") return <FinPedidos store={store} showToast={showToast} />;
  if (tab === "proveedores") return <FinRegistro store={store} showToast={showToast} categoria="pago_proveedor" titulo="Pago a proveedores" sub="Pagos a proveedores de insumos" />;
  return null;
}

function FinResumen({ store, isMobile }) {
  const [vista, setVista] = useState("semana"); // 'semana' | 'mes'
  // Offset de semanas/meses hacia atrás (0 = actual, 1 = anterior, ...)
  const [offset, setOffset] = useState(0);

  const costoDeItems = (items) => costoDeVenta(items, store.menu, store.insumos);

  // Definir el rango [desde, hasta) según la vista y el offset
  let desde, hasta, etiqueta;
  if (vista === "semana") {
    const base = inicioSemana(new Date());
    base.setDate(base.getDate() - offset * 7);
    desde = base.getTime();
    const fin = new Date(base);
    fin.setDate(fin.getDate() + 7);
    hasta = fin.getTime();
    etiqueta = etiquetaSemana(localDateStr(base));
  } else {
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth() - offset, 1);
    desde = primerDia.getTime();
    const finMes = new Date(primerDia.getFullYear(), primerDia.getMonth() + 1, 1);
    hasta = finMes.getTime();
    etiqueta = primerDia.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  }

  const enRango = (ts) => ts >= desde && ts < hasta;

  // Ventas ya cobradas cuyo dinero entró EN ESTE período. Se agrupan por la fecha en que
  // se cobraron (fechaPagoDe), no por la fecha en que se crearon — así una cuenta que se dejó
  // pendiente una semana y se cobró la siguiente cuenta como ingreso de la semana en que
  // realmente entró el dinero, no de la semana en que solo se prometió. El costo de esos
  // productos (COGS) se reconoce en el mismo momento, para que ingreso y costo queden en el
  // mismo período y cada cierre semanal sea internamente consistente.
  const cobradasEnPeriodo = store.ventas.filter(
    (v) => !v.anulada && v.tipoVenta !== "interno" && v.metodoPago !== "pendiente" && enRango(fechaPagoDe(v))
  );
  const ingresoEfectivo = cobradasEnPeriodo.reduce((s, v) => s + montoPorMetodo(v, "efectivo"), 0);
  const ingresoTransfer = cobradasEnPeriodo.reduce((s, v) => s + montoPorMetodo(v, "transferencia"), 0);
  const totalIngresos = ingresoEfectivo + ingresoTransfer;
  const cogs = cobradasEnPeriodo.reduce((s, v) => s + costoDeItems(v.items), 0);

  // Cuentas que SIGUEN pendientes, de lo que se vendió (creó) en este período — esta sí se
  // agrupa por fecha de creación, porque aún no tienen una fecha real de cobro.
  const porCobrar = store.ventas
    .filter((v) => !v.anulada && v.tipoVenta !== "interno" && v.metodoPago === "pendiente" && enRango(v.ts))
    .reduce((s, v) => s + v.total, 0);

  // Consumo interno: se agrupa por fecha de creación (no tiene concepto de "cobro" pendiente).
  const internoR = store.ventas.filter((v) => enRango(v.ts) && !v.anulada && v.tipoVenta === "interno");
  const costoInterno = internoR.reduce((s, v) => s + costoDeItems(v.items), 0);

  const movs = (store.movsFinancieros || []).filter((m) => enRango(m.ts));
  const egresoEfectivo = movs.filter((m) => (m.metodo || "efectivo") === "efectivo").reduce((s, m) => s + m.monto, 0);
  const egresoTransfer = movs.filter((m) => m.metodo === "transferencia").reduce((s, m) => s + m.monto, 0);
  const gastos = movs.filter((m) => m.categoria === "gasto").reduce((s, m) => s + m.monto, 0);
  const pagosPersonal = movs.filter((m) => m.categoria === "pago_personal").reduce((s, m) => s + m.monto, 0);
  const pagosProveedor = movs.filter((m) => m.categoria === "pago_proveedor").reduce((s, m) => s + m.monto, 0);
  const totalEgresos = gastos + pagosPersonal + pagosProveedor;
  const saldoEfectivo = ingresoEfectivo - egresoEfectivo;
  const saldoTransfer = ingresoTransfer - egresoTransfer;
  const utilidad = totalIngresos - cogs - totalEgresos;

  // Para la vista mensual: desglose por semana dentro del mes
  const semanasDelMes = [];
  if (vista === "mes") {
    const agrup = {};
    const sumar = (ts, campo, val) => {
      const k = claveSemana(new Date(ts));
      if (!agrup[k]) agrup[k] = { ingresos: 0, egresos: 0 };
      agrup[k][campo] += val;
    };
    for (const v of cobradasEnPeriodo) sumar(fechaPagoDe(v), "ingresos", v.total);
    for (const m of movs) sumar(m.ts, "egresos", m.monto);
    Object.entries(agrup).sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, d]) => {
      semanasDelMes.push({ clave: k, etiqueta: etiquetaSemana(k), ...d, neto: d.ingresos - d.egresos });
    });
  }

  const linea = (label, valor, signo, color) => (
    <div style={S.finLinea}>
      <span style={S.finLineaLabel}>{label}</span>
      <span style={{ ...S.finLineaValor, ...(color ? { color } : {}) }}>{signo}{CLP(Math.abs(valor))}</span>
    </div>
  );

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Resumen financiero</div>
          <div style={S.adminSub}>Cierres por semana (Lun–Dom) y resumen mensual</div>
        </div>
      </div>

      <div style={S.rangeRow} className="range-row">
        <button onClick={() => { setVista("semana"); setOffset(0); }} style={{ ...S.rangeBtn, ...(vista === "semana" ? S.rangeBtnActive : {}) }}>Por semana</button>
        <button onClick={() => { setVista("mes"); setOffset(0); }} style={{ ...S.rangeBtn, ...(vista === "mes" ? S.rangeBtnActive : {}) }}>Por mes</button>
      </div>

      {/* Navegador de período */}
      <div style={S.periodoNav}>
        <button onClick={() => setOffset(offset + 1)} style={S.periodoNavBtn}>◀ Anterior</button>
        <div style={S.periodoLabel}>
          <div style={S.periodoTexto}>{etiqueta}</div>
          {offset === 0 && <div style={S.periodoActual}>{vista === "semana" ? "Semana actual" : "Mes actual"}</div>}
        </div>
        <button onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0} style={{ ...S.periodoNavBtn, ...(offset === 0 ? S.ordenBtnDisabled : {}) }}>Siguiente ▶</button>
      </div>

      <div style={{ ...S.statsRow, marginBottom: 20 }} className="stats-row">
        <div style={S.statCard}><div style={S.statValue}>{CLP(totalIngresos)}</div><div style={S.statLabel}>Ingresos cobrados</div></div>
        <div style={S.statCard}><div style={S.statValue}>{CLP(totalEgresos + cogs)}</div><div style={S.statLabel}>Costos + gastos</div></div>
        <div style={S.statCard}><div style={{ ...S.statValue, color: utilidad >= 0 ? "#2E9E5B" : "#B4271A" }}>{CLP(utilidad)}</div><div style={S.statLabel}>{vista === "semana" ? "Utilidad semana" : "Utilidad mes"}</div></div>
      </div>

      {vista === "mes" && semanasDelMes.length > 0 && (
        <div style={S.chartCard}>
          <div style={S.breakdownTitle}>Semanas del mes</div>
          {semanasDelMes.map((sem) => (
            <div key={sem.clave} style={S.semanaRow}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{sem.etiqueta}</span>
              <span style={{ color: "#2E9E5B", fontWeight: 700, fontSize: 12.5 }}>+{CLP(sem.ingresos)}</span>
              <span style={{ color: "#B4271A", fontWeight: 700, fontSize: 12.5 }}>−{CLP(sem.egresos)}</span>
              <span style={{ fontWeight: 900, fontSize: 13, minWidth: 90, textAlign: "right", color: sem.neto >= 0 ? COLORS.ink : "#B4271A" }}>{CLP(sem.neto)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Saldos por medio de pago</div>
        <div style={S.consumoHelp}>Cuánto entró menos cuánto pagaste, por cada medio, en este período.</div>
        <div style={S.saldoRow}>
          <div style={S.saldoCard}>
            <div style={S.saldoLabel}>💵 Efectivo</div>
            <div style={{ ...S.saldoValor, color: saldoEfectivo >= 0 ? "#2E9E5B" : "#B4271A" }}>{CLP(saldoEfectivo)}</div>
            <div style={S.saldoDetalle}>+{CLP(ingresoEfectivo)} · −{CLP(egresoEfectivo)}</div>
          </div>
          <div style={S.saldoCard}>
            <div style={S.saldoLabel}>🏦 Transferencia</div>
            <div style={{ ...S.saldoValor, color: saldoTransfer >= 0 ? "#2E9E5B" : "#B4271A" }}>{CLP(saldoTransfer)}</div>
            <div style={S.saldoDetalle}>+{CLP(ingresoTransfer)} · −{CLP(egresoTransfer)}</div>
          </div>
        </div>
      </div>

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Estado de resultados</div>
        {linea("Ventas en efectivo", ingresoEfectivo, "+", "#2E9E5B")}
        {linea("Ventas por transferencia", ingresoTransfer, "+", "#2E9E5B")}
        <div style={S.finDivider} />
        {linea("Costo de productos vendidos (insumos)", cogs, "−", "#B4271A")}
        {linea("Pago a proveedores", pagosProveedor, "−", "#B4271A")}
        {linea("Pago a personal", pagosPersonal, "−", "#B4271A")}
        {linea("Otros gastos y facturas", gastos, "−", "#B4271A")}
        <div style={S.finDivider} />
        <div style={S.finTotalRow}>
          <span>Utilidad estimada</span>
          <span style={{ color: utilidad >= 0 ? "#2E9E5B" : "#B4271A" }}>{CLP(utilidad)}</span>
        </div>
      </div>

      <div style={S.chartCard}>
        <div style={S.breakdownTitle}>Otros datos</div>
        {linea("Cuentas por cobrar (pendientes)", porCobrar, "", "#B8860B")}
        {linea("Costo del consumo interno", costoInterno, "", COLORS.muted)}
      </div>

      <div style={S.finNota}>
        Cada semana (lunes a domingo) arranca en cero. Usa las flechas para ver semanas o meses anteriores.
        La utilidad es estimada: ventas cobradas − costo de insumos − gastos registrados.
      </div>
    </div>
  );
}

// --- Liquidación semanal de personal (jornales − consumos internos) ---
function FinLiquidacionPersonal({ store, showToast, isMobile }) {
  const [offset, setOffset] = useState(0); // semanas hacia atrás
  const [jornales, setJornales] = useState({}); // { trabajadorId: cantidadJornales }
  const [confirmPago, setConfirmPago] = useState(null);


  // Rango de la semana seleccionada (Lun-Dom)
  const base = inicioSemana(new Date());
  base.setDate(base.getDate() - offset * 7);
  const desde = base.getTime();
  const finFecha = new Date(base);
  finFecha.setDate(finFecha.getDate() + 7);
  const hasta = finFecha.getTime();
  const etiqueta = etiquetaSemana(localDateStr(base));
  const claveSem = localDateStr(base);

  // Valor a precio de venta de los consumos internos de una persona en la semana
  const consumoDe = (nombreConsumo) => {
    if (!nombreConsumo) return { total: 0, items: [] };
    const ventasInt = store.ventas.filter(
      (v) => v.tipoVenta === "interno" && !v.anulada && v.socioInterno === nombreConsumo && v.ts >= desde && v.ts < hasta
    );
    let total = 0;
    const items = [];
    for (const v of ventasInt) {
      for (const it of v.items) {
        total += it.precio * it.cant;
        items.push({ nombre: it.nombre, cant: it.cant, valor: it.precio * it.cant });
      }
    }
    return { total, items };
  };

  // ¿Ya se registró el pago de esta persona esta semana? (evita pagar dos veces)
  const yaPagado = (trabajadorId) =>
    (store.movsFinancieros || []).some(
      (m) => m.categoria === "pago_personal" && m.trabajadorId === trabajadorId && m.semana === claveSem
    );

  const registrarPago = (trab, jornalesTrab, consumo, neto, metodo = "efectivo") => {
    if (jornalesTrab <= 0) { showToast("Ingresa cuántos jornales trabajó", "error"); return; }
    store.saveMovsFinancieros([
      ...(store.movsFinancieros || []),
      {
        id: uid(),
        categoria: "pago_personal",
        concepto: `Liquidación ${trab.nombre} · ${etiqueta}`,
        monto: neto,
        fecha: todayStr(),
        ts: Date.now(),
        metodo,
        trabajadorId: trab.id,
        semana: claveSem,
        nota: `${jornalesTrab} jornales × ${CLP(trab.valorJornal || 0)} − consumo ${CLP(consumo.total)}`,
      },
    ]);
    setConfirmPago(null);
    showToast(`Pago de ${trab.nombre} registrado`);
  };

  // Consumo de los socios en la semana (informativo, no se paga)
  const consumoSocios = SOCIOS.map((s) => ({ nombre: s, ...consumoDe(s) })).filter((s) => s.total > 0);

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Liquidación de personal</div>
          <div style={S.adminSub}>Pago por jornales de la semana, menos sus consumos internos</div>
        </div>
      </div>

      <div style={S.periodoNav}>
        <button onClick={() => setOffset(offset + 1)} style={S.periodoNavBtn}>◀ Anterior</button>
        <div style={S.periodoLabel}>
          <div style={S.periodoTexto}>{etiqueta}</div>
          {offset === 0 && <div style={S.periodoActual}>Semana actual</div>}
        </div>
        <button onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0} style={{ ...S.periodoNavBtn, ...(offset === 0 ? S.ordenBtnDisabled : {}) }}>Siguiente ▶</button>
      </div>

      {store.personal.length === 0 && (
        <div style={S.emptyState}>
          Aún no has registrado trabajadores. Ve a Administración → Personal para agregarlos con su valor de jornal.
        </div>
      )}

      {store.personal.map((trab) => {
        const consumo = consumoDe(trab.nombreConsumo);
        const nJornales = jornales[trab.id] !== undefined ? jornales[trab.id] : "";
        const jornalesNum = parseInt(nJornales) || 0;
        const bruto = jornalesNum * (trab.valorJornal || 0);
        const neto = bruto - consumo.total;
        const pagado = yaPagado(trab.id);
        return (
          <div key={trab.id} style={S.liqCard}>
            <div style={S.liqHeader}>
              <div>
                <div style={S.liqNombre}>{trab.nombre}</div>
                <div style={S.liqRol}>{trab.rol || "Sin rol"} · {CLP(trab.valorJornal || 0)}/jornal</div>
              </div>
              {pagado && <span style={S.liqPagadoTag}>✓ Pagado</span>}
            </div>

            <div style={S.liqJornalRow}>
              <span style={S.liqLabel}>Jornales trabajados esta semana</span>
              <input
                type="number"
                min="0"
                value={nJornales}
                onChange={(e) => setJornales({ ...jornales, [trab.id]: e.target.value })}
                placeholder="0"
                style={S.liqInput}
                disabled={pagado}
              />
            </div>

            <div style={S.liqLinea}>
              <span>Bruto ({jornalesNum} × {CLP(trab.valorJornal || 0)})</span>
              <span style={{ fontWeight: 700 }}>{CLP(bruto)}</span>
            </div>
            {consumo.total > 0 && (
              <div style={S.liqLinea}>
                <span style={{ color: "#B4271A" }}>− Consumo interno ({consumo.items.length} ítems)</span>
                <span style={{ color: "#B4271A", fontWeight: 700 }}>− {CLP(consumo.total)}</span>
              </div>
            )}
            {consumo.items.length > 0 && (
              <div style={S.liqConsumoDetalle}>
                {consumo.items.map((it, i) => (
                  <span key={i} style={S.liqConsumoChip}>{it.cant}× {it.nombre}</span>
                ))}
              </div>
            )}
            <div style={S.liqNeto}>
              <span>Neto a pagar</span>
              <span style={{ color: neto >= 0 ? "#2E9E5B" : "#B4271A" }}>{CLP(neto)}</span>
            </div>

            {!pagado && (
              <button
                onClick={() => setConfirmPago({ trab, jornalesNum, consumo, neto })}
                style={{ ...S.newInsumoBtn, width: "100%", marginTop: 10, justifyContent: "center", opacity: jornalesNum > 0 ? 1 : 0.5 }}
                disabled={jornalesNum <= 0}
              >
                <Check size={16} /> Registrar pago de {CLP(neto)}
              </button>
            )}
          </div>
        );
      })}

      {/* Consumo de los socios, separado (no se paga jornal) */}
      <div style={{ ...S.chartCard, marginTop: 24 }}>
        <div style={S.breakdownTitle}>Consumo interno de socios (esta semana)</div>
        <div style={S.consumoHelp}>{SOCIOS.join(", ")} no cobran jornal. Su consumo se muestra aparte, solo como registro.</div>
        {consumoSocios.length === 0 ? (
          <div style={S.emptyState}>Sin consumo de socios esta semana</div>
        ) : (
          consumoSocios.map((s) => (
            <div key={s.nombre} style={S.liqLinea}>
              <span style={{ fontWeight: 700 }}>{s.nombre}</span>
              <span style={{ fontWeight: 700 }}>{CLP(s.total)}</span>
            </div>
          ))
        )}
      </div>

      {confirmPago && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmPago(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Confirmar pago</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 8 }}>{confirmPago.trab.nombre} · {etiqueta}</div>
            <div style={S.liqLinea}><span>Bruto</span><span>{CLP(confirmPago.jornalesNum * (confirmPago.trab.valorJornal || 0))}</span></div>
            {confirmPago.consumo.total > 0 && <div style={S.liqLinea}><span style={{ color: "#B4271A" }}>− Consumo</span><span style={{ color: "#B4271A" }}>− {CLP(confirmPago.consumo.total)}</span></div>}
            <div style={S.liqNeto}><span>Neto</span><span style={{ color: "#2E9E5B" }}>{CLP(confirmPago.neto)}</span></div>
            <label style={S.formLabel}>¿Con qué se le paga?</label>
            <div style={S.catToggle}>
              <button onClick={() => setConfirmPago({ ...confirmPago, metodo: "efectivo" })} style={{ ...S.catToggleBtn, ...((confirmPago.metodo || "efectivo") === "efectivo" ? S.catToggleActive : {}) }}>💵 Efectivo</button>
              <button onClick={() => setConfirmPago({ ...confirmPago, metodo: "transferencia" })} style={{ ...S.catToggleBtn, ...(confirmPago.metodo === "transferencia" ? S.catToggleActive : {}) }}>🏦 Transferencia</button>
            </div>
            <div style={{ ...S.detailMeta, textAlign: "center", margin: "12px 0" }}>Se registrará como pago a personal de esta semana.</div>
            <div style={S.modalActions}>
              <button onClick={() => setConfirmPago(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => registrarPago(confirmPago.trab, confirmPago.jornalesNum, confirmPago.consumo, confirmPago.neto, confirmPago.metodo || "efectivo")} style={S.modalConfirm}><Check size={18} /> Confirmar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

function FinRegistro({ store, showToast, categoria, titulo, sub }) {
  const [editando, setEditando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const movs = (store.movsFinancieros || []).filter((m) => m.categoria === categoria).sort((a, b) => b.ts - a.ts);
  const total = movs.reduce((s, m) => s + m.monto, 0);

  const guardar = (data) => {
    if (!data.concepto.trim()) { showToast("Escribe el concepto", "error"); return false; }
    const monto = parseFloat(data.monto) || 0;
    if (monto <= 0) { showToast("Ingresa un monto válido", "error"); return false; }
    if (data.id) {
      store.saveMovsFinancieros(store.movsFinancieros.map((m) => (m.id === data.id ? { ...m, concepto: data.concepto.trim(), monto, fecha: data.fecha, nota: data.nota || "", metodo: data.metodo || "efectivo" } : m)));
      showToast("Registro actualizado");
    } else {
      const fechaTs = data.fecha ? new Date(data.fecha + "T12:00:00").getTime() : Date.now();
      store.saveMovsFinancieros([...(store.movsFinancieros || []), { id: uid(), categoria, concepto: data.concepto.trim(), monto, fecha: data.fecha || todayStr(), ts: fechaTs, nota: data.nota || "", metodo: data.metodo || "efectivo" }]);
      showToast("Registro agregado");
    }
    setEditando(null);
    return true;
  };
  const eliminar = (m) => {
    store.saveMovsFinancieros(store.movsFinancieros.filter((x) => x.id !== m.id));
    setConfirmDel(null);
    showToast("Registro eliminado");
  };

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>{titulo}</div>
          <div style={S.adminSub}>{sub}</div>
        </div>
        <button onClick={() => setEditando({ fecha: todayStr() })} style={S.newInsumoBtn}><Plus size={16} /> Nuevo registro</button>
      </div>

      <div style={{ ...S.statCard, marginBottom: 16 }}>
        <div style={S.statValue}>{CLP(total)}</div>
        <div style={S.statLabel}>Total registrado ({movs.length})</div>
      </div>

      <div style={S.productosList}>
        {movs.length === 0 && <div style={S.emptyState}>Sin registros todavía</div>}
        {movs.map((m) => (
          <div key={m.id} style={S.productoRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.productoNombre}>{m.concepto}</div>
              <div style={S.productoMeta}>{m.metodo === "transferencia" ? "🏦 Transferencia" : "💵 Efectivo"} · {m.fecha}{m.nota ? ` · ${m.nota}` : ""}</div>
            </div>
            <div style={{ fontWeight: 800, color: COLORS.ink, marginRight: 8 }}>{CLP(m.monto)}</div>
            <div style={S.productoActions}>
              <button onClick={() => setEditando(m)} style={S.iconActionBtn}><Settings size={13} /></button>
              <button onClick={() => setConfirmDel(m)} style={S.iconActionBtnDanger}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {editando && <MovFinancieroModal mov={editando} titulo={titulo} onCancel={() => setEditando(null)} onSave={guardar} />}
      {confirmDel && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmDel(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Eliminar este registro?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>{confirmDel.concepto} · {CLP(confirmDel.monto)}</div>
            <div style={S.modalActions}>
              <button onClick={() => setConfirmDel(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} style={S.modalAnularConfirmBtn}><Trash2 size={17} /> Eliminar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

// --- Pedidos de insumos a proveedores (dinero externo: qué se pidió, cuánto cuesta, si ya se recibió y se pagó) ---
function FinPedidos({ store, showToast }) {
  const [editando, setEditando] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const pedidos = (store.pedidosInsumos || []).slice().sort((a, b) => b.ts - a.ts);
  const porPagar = pedidos.filter((p) => !p.pagado).reduce((s, p) => s + p.total, 0);

  const guardar = (d) => {
    if (!(d.proveedor || "").trim()) { showToast("Escribe el proveedor", "error"); return false; }
    if (!(d.detalle || "").trim()) { showToast("Escribe qué se pidió", "error"); return false; }
    const total = parseFloat(d.total) || 0;
    if (total <= 0) { showToast("Ingresa el total del pedido", "error"); return false; }
    if (d.id) {
      store.savePedidosInsumos(store.pedidosInsumos.map((p) => (p.id === d.id ? { ...p, proveedor: d.proveedor.trim(), detalle: d.detalle.trim(), total, fecha: d.fecha } : p)));
      showToast("Pedido actualizado");
    } else {
      store.savePedidosInsumos([...(store.pedidosInsumos || []), { id: uid(), proveedor: d.proveedor.trim(), detalle: d.detalle.trim(), total, fecha: d.fecha || todayStr(), ts: Date.now(), recibido: false, pagado: false }]);
      showToast("Pedido registrado");
    }
    setEditando(null);
    return true;
  };
  const marcarRecibido = (p) => {
    store.savePedidosInsumos(store.pedidosInsumos.map((x) => (x.id === p.id ? { ...x, recibido: true, recibidoFecha: todayStr() } : x)));
    showToast("Marcado como recibido");
  };
  const pagar = (p, metodo) => {
    // El pago entra a "Pago a proveedores" para que cuente en el resumen financiero
    const mov = { id: uid(), categoria: "pago_proveedor", concepto: `Pedido a ${p.proveedor}: ${p.detalle}`.slice(0, 120), monto: p.total, fecha: todayStr(), ts: Date.now(), nota: "Desde Pedidos de insumos", metodo, pedidoId: p.id };
    store.saveMovsFinancieros([...(store.movsFinancieros || []), mov]);
    store.savePedidosInsumos(store.pedidosInsumos.map((x) => (x.id === p.id ? { ...x, pagado: true, pagadoFecha: todayStr(), metodoPago: metodo, movId: mov.id } : x)));
    setPagando(null);
    showToast("Pago registrado en Pago a proveedores");
  };
  const eliminar = (p) => {
    if (p.pagado && p.movId) store.saveMovsFinancieros((store.movsFinancieros || []).filter((m) => m.id !== p.movId));
    store.savePedidosInsumos(store.pedidosInsumos.filter((x) => x.id !== p.id));
    setConfirmDel(null);
    showToast("Pedido eliminado");
  };

  return (
    <div>
      <div style={S.adminHeader}>
        <div>
          <div style={S.adminTitle}>Pedidos de insumos</div>
          <div style={S.adminSub}>Lo que se pide a proveedores, si llegó y si ya se pagó</div>
        </div>
        <button onClick={() => setEditando({ fecha: todayStr() })} style={S.newInsumoBtn}><Plus size={16} /> Nuevo pedido</button>
      </div>
      <div style={{ ...S.statCard, marginBottom: 16 }}>
        <div style={S.statValue}>{CLP(porPagar)}</div>
        <div style={S.statLabel}>Por pagar a proveedores</div>
      </div>
      <div style={S.productosList}>
        {pedidos.length === 0 && <div style={S.emptyState}>Sin pedidos todavía</div>}
        {pedidos.map((p) => (
          <div key={p.id} style={{ ...S.productoRow, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={S.productoNombre}>{p.proveedor}</div>
              <div style={S.productoMeta}>{p.detalle} · {p.fecha}</div>
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800 }}>
                <span style={{ color: p.recibido ? "#2E9E5B" : "#B8860B" }}>{p.recibido ? "✓ Recibido" : "⏳ Por recibir"}</span>
                {" · "}
                <span style={{ color: p.pagado ? "#2E9E5B" : "#B4271A" }}>{p.pagado ? `✓ Pagado (${p.metodoPago === "transferencia" ? "transf." : "efectivo"})` : "Por pagar"}</span>
              </div>
            </div>
            <div style={{ fontWeight: 800, color: COLORS.ink, marginRight: 8 }}>{CLP(p.total)}</div>
            <div style={{ ...S.productoActions, flexWrap: "wrap" }}>
              {!p.recibido && <button onClick={() => marcarRecibido(p)} style={S.iconActionBtn} title="Marcar recibido"><Check size={13} /></button>}
              {!p.pagado && <button onClick={() => setPagando(p)} style={S.iconActionBtn} title="Registrar pago"><DollarSign size={13} /></button>}
              {!p.pagado && <button onClick={() => setEditando({ ...p })} style={S.iconActionBtn} title="Editar"><Settings size={13} /></button>}
              <button onClick={() => setConfirmDel(p)} style={S.iconActionBtnDanger} title="Eliminar"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setEditando(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>{editando.id ? "Editar pedido" : "Nuevo pedido"}</div>
            <label style={S.formLabel}>Proveedor</label>
            <input type="text" value={editando.proveedor || ""} onChange={(e) => setEditando({ ...editando, proveedor: e.target.value })} style={S.formInput} />
            <label style={S.formLabel}>¿Qué se pidió?</label>
            <input type="text" value={editando.detalle || ""} onChange={(e) => setEditando({ ...editando, detalle: e.target.value })} placeholder="Ej: 20 kg de harina, 100 cajas" style={S.formInput} />
            <label style={S.formLabel}>Total</label>
            <MoneyInput value={editando.total ?? ""} onChange={(v) => setEditando({ ...editando, total: v })} style={S.formInput} />
            <label style={S.formLabel}>Fecha</label>
            <input type="date" value={editando.fecha || todayStr()} onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} style={S.formInput} />
            <div style={{ ...S.modalActions, marginTop: 16 }}>
              <button onClick={() => setEditando(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => guardar(editando)} style={S.modalConfirm}><Check size={18} /> Guardar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
      {pagando && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setPagando(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Registrar pago de {CLP(pagando.total)}</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>¿Cómo se pagó a {pagando.proveedor}?</div>
            <div style={S.catToggle}>
              <button onClick={() => pagar(pagando, "efectivo")} style={S.catToggleBtn}>💵 Efectivo</button>
              <button onClick={() => pagar(pagando, "transferencia")} style={S.catToggleBtn}>🏦 Transferencia</button>
            </div>
            <div style={S.modalActions}><button onClick={() => setPagando(null)} style={S.modalCancel}>Cancelar</button></div>
          </div>
        </div></ModalPortal>
      )}
      {confirmDel && (
        <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={() => setConfirmDel(null)}>
          <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>¿Eliminar este pedido?</div>
            <div style={{ ...S.detailMeta, textAlign: "center", marginBottom: 14 }}>
              {confirmDel.proveedor} · {CLP(confirmDel.total)}{confirmDel.pagado ? " — también se quita su pago de Pago a proveedores." : ""}
            </div>
            <div style={S.modalActions}>
              <button onClick={() => setConfirmDel(null)} style={S.modalCancel}>Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} style={S.modalAnularConfirmBtn}><Trash2 size={17} /> Eliminar</button>
            </div>
          </div>
        </div></ModalPortal>
      )}
    </div>
  );
}

function MovFinancieroModal({ mov, titulo, onCancel, onSave }) {
  const [concepto, setConcepto] = useState(mov.concepto || "");
  const [monto, setMonto] = useState(mov.monto != null ? String(mov.monto) : "");
  const [fecha, setFecha] = useState(mov.fecha || todayStr());
  const [nota, setNota] = useState(mov.nota || "");
  const [metodo, setMetodo] = useState(mov.metodo || "efectivo");
  const esNuevo = !mov.id;
  return (
    <ModalPortal><div className="modal-backdrop" style={S.modalBackdrop} onClick={onCancel}>
      <div className="modal-card" style={S.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={S.detailHeader}>
          <div style={S.modalTitle}>{esNuevo ? "Nuevo registro" : "Editar registro"}</div>
          <button onClick={onCancel} style={S.closeX}><X size={18} /></button>
        </div>
        <label style={S.formLabel}>Concepto</label>
        <input type="text" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: Compra de carne, sueldo Juan" style={S.formInput} />
        <label style={S.formLabel}>Monto</label>
        <MoneyInput value={monto} onChange={setMonto} placeholder="Ej: $ 150.000" style={S.formInput} />
        <label style={S.formLabel}>¿Cómo se pagó?</label>
        <div style={S.catToggle}>
          <button onClick={() => setMetodo("efectivo")} style={{ ...S.catToggleBtn, ...(metodo === "efectivo" ? S.catToggleActive : {}) }}>💵 Efectivo</button>
          <button onClick={() => setMetodo("transferencia")} style={{ ...S.catToggleBtn, ...(metodo === "transferencia" ? S.catToggleActive : {}) }}>🏦 Transferencia</button>
        </div>
        <label style={S.formLabel}>Fecha</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={S.formInput} />
        <label style={S.formLabel}>Nota (opcional)</label>
        <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Detalle o número de factura" style={S.formInput} />
        <div style={{ ...S.modalActions, marginTop: 18 }}>
          <button onClick={onCancel} style={S.modalCancel}>Cancelar</button>
          <button onClick={() => onSave({ ...mov, concepto, monto, fecha, nota, metodo })} style={S.modalConfirm}><Check size={18} /> {esNuevo ? "Registrar" : "Guardar"}</button>
        </div>
      </div>
    </div></ModalPortal>
  );
}

// ============================================================
// ESTILOS (design system — paleta de marca Gordo Pizzería)
// ============================================================
const COLORS = {
  bg: "#F4E1C8",       // crema cálido (fondo principal)
  panel: "#FFFFFF",
  ink: "#312318",      // café oscuro (textos)
  inkSoft: "#5A4636",
  muted: "#8A7260",
  border: "#E1C7A5",   // beige tostado
  red: "#822D1B",      // rojo ladrillo (titulares y llamados a la acción)
  redDark: "#5E1F12",
  redSoft: "#F6E3D8",
  green: "#2E9E5B",
  ocre: "#CD8C48",     // acentos
};

const S = {
  app: { display: "flex", height: "100vh", width: "100%", background: COLORS.bg, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", overflow: "hidden" },
  appMobile: { flexDirection: "column", position: "fixed", inset: 0, height: "auto" },

  // Navegación inferior (móvil)
  bottomNav: { position: "fixed", bottom: 0, left: 0, right: 0, display: "flex", overflowX: "auto", background: "#fff", borderTop: `1px solid ${COLORS.border}`, zIndex: 90, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -2px 12px rgba(46,27,21,0.06)" },
  bottomNavBtn: { flex: "1 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: "9px 2px 8px", border: "none", background: "transparent", color: COLORS.muted, cursor: "pointer", minWidth: 0 },
  // Admin en celular: barra inferior de módulos
  modNavBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "9px 6px 10px", border: "none", background: "transparent", color: COLORS.muted, cursor: "pointer", WebkitTapHighlightColor: "transparent" },
  modNavBtnActive: { color: COLORS.red },
  modNavIcon: { width: 60, height: 32, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 160ms ease" },
  modNavIconActive: { background: COLORS.redSoft },
  modNavLabel: { fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  // Admin en celular: botones de sección bajo el título
  sectionTabs: { position: "relative", display: "flex", gap: 8, overflowX: "auto", padding: "10px 14px", background: COLORS.panel, borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" },
  sectionTab: { flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 99, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontSize: 13.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", WebkitTapHighlightColor: "transparent" },
  sectionTabActive: { background: COLORS.red, borderColor: COLORS.red, color: "#fff" },
  sectionTabBadge: { background: "#B8860B", color: "#fff", fontSize: 10.5, fontWeight: 800, borderRadius: 99, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" },
  sectionTabDot: { width: 8, height: 8, borderRadius: 99 },

  // Impresión: botón principal (comanda + recibo) y botones secundarios
  printBtnAmbos: { flex: 2, padding: "13px 8px", borderRadius: 12, border: "none", background: COLORS.ink, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 },
  printOnlyRow: { display: "flex", gap: 8, marginTop: 10 },
  printOnlyBtn: { flex: 1, padding: "9px 6px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, cursor: "pointer", fontSize: 12.5 },
  reprintBtnAmbos: { flex: 1.6, padding: "12px", borderRadius: 12, border: `1.5px solid ${COLORS.ink}`, background: COLORS.ink, color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer" },
  bottomNavBtnActive: { color: COLORS.red },
  bottomNavLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap" },
  bottomNavBadge: { position: "absolute", top: -5, right: -9, background: "#B8860B", color: "#fff", fontSize: 9.5, fontWeight: 800, borderRadius: 99, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" },
  bottomNavDot: { position: "absolute", top: -2, right: -4, width: 7, height: 7, borderRadius: 99, border: "1.5px solid #fff" },

  loadingScreen: { height: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg },
  loadingCard: { display: "flex", flexDirection: "column", alignItems: "center" },

  modoScreen: { minHeight: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, padding: 20, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" },
  modoCard: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 22, padding: 32, width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", boxShadow: "0 10px 40px rgba(46,27,21,0.08)" },
  modoTitle: { fontSize: 21, fontWeight: 900, color: COLORS.ink, marginTop: 16, letterSpacing: "-0.02em" },
  modoSub: { fontSize: 13, color: COLORS.muted, marginTop: 8, marginBottom: 24, lineHeight: 1.5 },
  modoOption: { display: "flex", alignItems: "flex-start", gap: 14, width: "100%", padding: 18, borderRadius: 16, border: `1.5px solid ${COLORS.border}`, background: "#fff", cursor: "pointer", textAlign: "left", marginBottom: 12 },
  modoOptionIcon: { width: 44, height: 44, borderRadius: 12, background: COLORS.redSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  modoOptionText: { flex: 1, minWidth: 0 },
  modoOptionTitle: { fontSize: 16, fontWeight: 800, color: COLORS.ink, marginBottom: 4 },
  modoOptionDesc: { fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 },
  modoWarn: { fontSize: 11.5, color: "#8A6D1D", background: "#FBF3DC", padding: "10px 14px", borderRadius: 10, lineHeight: 1.5, marginTop: 6 },

  consultaBar: { display: "flex", alignItems: "center", gap: 9, padding: "10px 32px", background: "#EAF3FB", color: "#3A5FA0", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  cambiarModoBtn: { width: "100%", marginTop: 8, padding: "9px 10px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer" },
  moduloSelector: { display: "flex", flexDirection: "column", gap: 4, padding: "0 12px 12px", borderBottom: `1px solid ${COLORS.border}`, marginBottom: 12 },
  moduloBtn: { display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", color: COLORS.inkSoft, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left", width: "100%" },
  moduloBtnActive: { background: COLORS.redSoft, color: COLORS.redDark },
  moduloLock: { marginLeft: "auto", fontSize: 11, opacity: 0.6 },
  adminHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18, flexWrap: "wrap" },
  adminTitle: { fontSize: 20, fontWeight: 900, color: COLORS.ink, letterSpacing: "-0.02em" },
  adminSub: { fontSize: 13, color: COLORS.muted, fontWeight: 600, marginTop: 3 },
  alertaCard: { flex: 1, background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 16, padding: 18, textAlign: "center", minWidth: 0 },
  alertaValor: (color) => ({ fontSize: 30, fontWeight: 900, color: color || COLORS.ink, lineHeight: 1 }),
  alertaTitulo: { fontSize: 12.5, fontWeight: 700, color: COLORS.inkSoft, marginTop: 6 },
  alertaDetalle: { fontSize: 11.5, color: COLORS.muted, marginTop: 3 },
  alertaRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: `1px solid #F5EEE9`, fontSize: 13.5, flexWrap: "wrap" },
  finLinea: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid #F5EEE9`, fontSize: 13.5 },
  finLineaLabel: { color: COLORS.inkSoft, fontWeight: 600 },
  finLineaValor: { fontWeight: 800, color: COLORS.ink, whiteSpace: "nowrap" },
  finDivider: { height: 2, background: COLORS.border, margin: "8px 0" },
  finTotalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0 4px", fontSize: 18, fontWeight: 900, color: COLORS.ink },
  finNota: { fontSize: 12, color: COLORS.muted, lineHeight: 1.6, background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px" },
  saldoRow: { display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" },
  saldoCard: { flex: 1, minWidth: 160, background: "#F8EAD7", borderRadius: 14, padding: "16px 18px" },
  saldoLabel: { fontSize: 13, fontWeight: 700, color: COLORS.inkSoft },
  saldoValor: { fontSize: 26, fontWeight: 900, marginTop: 6, lineHeight: 1 },
  saldoDetalle: { fontSize: 11.5, color: COLORS.muted, marginTop: 6, fontWeight: 600 },
  adminSub2: { fontSize: 12.5, color: COLORS.muted, marginBottom: 12, marginTop: -6 },
  ordenBtns: { display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 },
  ordenBtn: { width: 26, height: 20, borderRadius: 6, border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  ordenBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  periodoNav: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 14, padding: "10px 14px", marginBottom: 16 },
  periodoNavBtn: { padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" },
  periodoLabel: { textAlign: "center", flex: 1, minWidth: 0 },
  periodoTexto: { fontSize: 14.5, fontWeight: 900, color: COLORS.ink, textTransform: "capitalize" },
  periodoActual: { fontSize: 11, fontWeight: 700, color: "#2E9E5B", marginTop: 2 },
  semanaRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid #F5EEE9`, flexWrap: "wrap" },
  liqCard: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 16, padding: 18, marginBottom: 14 },
  liqHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  liqNombre: { fontSize: 16, fontWeight: 900, color: COLORS.ink },
  liqRol: { fontSize: 12.5, color: COLORS.muted, fontWeight: 600, marginTop: 2 },
  liqPagadoTag: { fontSize: 11.5, fontWeight: 800, color: "#2E9E5B", background: "#E6F4EC", padding: "4px 10px", borderRadius: 99 },
  liqJornalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", background: "#F8EAD7", borderRadius: 10, marginBottom: 10 },
  liqLabel: { fontSize: 13, fontWeight: 700, color: COLORS.inkSoft },
  liqInput: { width: 80, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 16, fontWeight: 800, textAlign: "center", background: "#fff" },
  liqLinea: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", fontSize: 13.5, color: COLORS.inkSoft, borderBottom: `1px solid #F5EEE9` },
  liqConsumoDetalle: { display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 0" },
  liqConsumoChip: { fontSize: 11.5, fontWeight: 700, background: "#FDF6F5", color: "#8A3128", padding: "3px 8px", borderRadius: 7 },
  liqNeto: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0 2px", fontSize: 17, fontWeight: 900, color: COLORS.ink },
  margenPreview: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F0F7F2", borderRadius: 10, fontSize: 13, fontWeight: 700, color: COLORS.inkSoft, marginTop: 4, flexWrap: "wrap" },
  margenPct: (pct) => ({ fontSize: 12.5, fontWeight: 900, color: pct >= 50 ? "#2E9E5B" : pct >= 25 ? "#B8860B" : "#B4271A", background: "#fff", padding: "3px 10px", borderRadius: 99 }),
  productoMargen: { color: COLORS.muted },
  avisoInventario: { background: "#EAF3FB", border: "1.5px solid #C5DDF2", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#2C4A6B", fontWeight: 600, marginBottom: 16, lineHeight: 1.5 },

  sidebar: { width: 220, background: "#FFFFFF", borderRight: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", overflowY: "auto", overflowX: "hidden" },
  brandBlock: { display: "flex", alignItems: "center", gap: 12, padding: "24px 20px", flexShrink: 0 },
  brandIcon: { width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.red}, ${COLORS.redDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  brandName: { fontWeight: 900, fontSize: 15.5, color: COLORS.ink, letterSpacing: "-0.02em", lineHeight: 1.15 },
  brandSub: { fontSize: 11.5, color: COLORS.muted, fontWeight: 600, marginTop: 2 },

  navList: { display: "flex", flexDirection: "column", gap: 4, padding: "8px 12px", flex: "1 0 auto" },
  navBtn: { display: "flex", alignItems: "center", gap: 13, padding: "13px 14px", borderRadius: 12, border: "none", background: "transparent", color: COLORS.inkSoft, fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left", position: "relative", transition: "background 140ms ease, color 140ms ease" },
  navBtnActive: { background: COLORS.redSoft, color: COLORS.redDark },
  cajaDot: { width: 8, height: 8, borderRadius: 99, marginLeft: "auto" },
  navBadge: { marginLeft: "auto", background: "#B8860B", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 99, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" },

  sidebarFooter: { padding: 16, borderTop: `1px solid ${COLORS.border}`, flexShrink: 0, background: "#fff", position: "sticky", bottom: 0 },
  cajaStatusPill: (open) => ({ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: open ? "#EAF7EF" : "#FBEEEC", color: open ? "#1D7A44" : "#B4271A", fontSize: 12.5, fontWeight: 700 }),
  cajaDotSmall: { width: 7, height: 7, borderRadius: 99 },

  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.panel, flexShrink: 0 },
  topbarMobile: { padding: "12px 16px", gap: 10 },
  topTitle: { fontSize: 22, fontWeight: 900, color: COLORS.ink, letterSpacing: "-0.02em" },
  topSub: { fontSize: 13, color: COLORS.muted, fontWeight: 600, marginTop: 2, textTransform: "capitalize" },
  topRight: { display: "flex", alignItems: "center", gap: 12 },
  warnPill: { display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 99, background: "#F6E3D8", color: COLORS.redDark, fontSize: 13, fontWeight: 700 },
  storageWarnBar: { display: "flex", alignItems: "center", gap: 9, padding: "10px 32px", background: "#B4271A", color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0 },
  clockPill: { display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 99, background: "#F3ECE6", color: COLORS.inkSoft, fontSize: 13, fontWeight: 700 },
  syncPill: { display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 99, background: "#fff", border: "1.5px solid #EBE0D8", fontSize: 13, fontWeight: 700, cursor: "pointer" },

  content: { flex: 1, overflow: "auto", padding: "24px 32px 40px" },
  contentMobile: { padding: "14px 14px 92px" },

  // POS
  posGrid: { display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, minHeight: "100%", alignItems: "start" },
  posGridMobile: { gridTemplateColumns: "minmax(0, 1fr)", gap: 14, height: "auto" },
  posLeft: {},
  // Categorías fijas arriba: no se mueven mientras se deslizan los productos
  catRow: { position: "sticky", top: -24, zIndex: 5, display: "flex", gap: 8, flexWrap: "wrap", background: COLORS.bg, margin: "-24px -20px 14px -32px", padding: "16px 20px 12px 32px", boxShadow: "0 6px 10px -8px rgba(46,27,21,0.25)" },
  catRowMobile: { top: -14, flexWrap: "nowrap", overflowX: "auto", margin: "-14px -14px 12px", padding: "10px 14px", scrollbarWidth: "none" },
  catBtn: { flexShrink: 0, whiteSpace: "nowrap", padding: "10px 20px", borderRadius: 99, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 14, cursor: "pointer" },
  catBtnActive: { background: COLORS.red, borderColor: COLORS.red, color: "#fff" },
  itemsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 },
  menuCard: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 18, padding: 18, textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, minHeight: 168, transition: "transform 120ms ease, box-shadow 120ms ease", boxShadow: "0 1px 2px rgba(46,27,21,0.04)" },
  menuCardDisabled: { opacity: 0.5, cursor: "not-allowed" },
  menuCardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  menuCardBadge: (color) => ({ width: 30, height: 30, borderRadius: 9, background: color === "bebida" ? "#EAF3FB" : COLORS.redSoft, color: color === "bebida" ? "#3A5FA0" : COLORS.red, display: "flex", alignItems: "center", justifyContent: "center" }),
  outStockTag: { fontSize: 10.5, fontWeight: 800, color: "#B4271A", background: "#FBEEEC", padding: "3px 8px", borderRadius: 99 },
  menuCardName: { fontWeight: 800, fontSize: 16.5, color: COLORS.ink, letterSpacing: "-0.01em" },
  menuCardDesc: { fontSize: 12.5, color: COLORS.muted, lineHeight: 1.4, flex: 1 },
  menuCardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  menuCardPrice: { fontWeight: 900, fontSize: 17, color: COLORS.redDark },
  menuCardAdd: { width: 32, height: 32, borderRadius: 99, background: COLORS.red, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" },
  stockWarnBar: { display: "flex", alignItems: "center", gap: 8, marginTop: 16, padding: "10px 14px", background: "#FBEEEC", borderRadius: 10, color: "#B4271A", fontSize: 13, fontWeight: 700 },

  posRight: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 20, display: "flex", flexDirection: "column", height: "calc(100vh - 160px)", position: "sticky", top: 0 },
  posRightMobile: { height: "auto", maxHeight: "none", position: "static", order: -1 },
  cartHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: `1px solid ${COLORS.border}` },
  cartTitle: { display: "flex", alignItems: "center", gap: 9, fontWeight: 800, fontSize: 16, color: COLORS.ink },
  cartClearBtn: { border: "none", background: "#FBEEEC", color: "#B4271A", width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  cartList: { flex: 1, overflow: "auto", padding: "8px 12px" },
  cartEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: COLORS.muted, fontSize: 13.5, fontWeight: 600, padding: 40, textAlign: "center" },
  cartRow: { display: "flex", alignItems: "center", gap: 10, padding: "12px 8px 4px" },
  cartItemBlock: { borderBottom: `1px solid #F5EEE9` },
  cartNotaToggle: { display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: COLORS.muted, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: "0 8px 10px" },
  cartNotaInput: { width: "calc(100% - 16px)", margin: "0 8px 10px", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #F0C36D", background: "#FFFBF0", fontSize: 12.5, fontWeight: 600, color: "#8A6D1D" },
  cartRowInfo: { flex: 1, minWidth: 0 },
  cartRowName: { fontWeight: 700, fontSize: 14, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cartRowPrice: { fontSize: 12, color: COLORS.muted, marginTop: 1 },
  qtyControls: { display: "flex", alignItems: "center", gap: 6, background: "#F8EAD7", borderRadius: 99, padding: "3px 6px" },
  qtyBtn: { width: 24, height: 24, borderRadius: 99, border: "none", background: "#fff", color: COLORS.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 1px 1px rgba(0,0,0,0.08)" },
  qtyNum: { fontWeight: 800, fontSize: 13.5, minWidth: 16, textAlign: "center" },
  cartRowDel: { border: "none", background: "transparent", color: COLORS.muted, cursor: "pointer", padding: 4 },
  cartSummary: { padding: 18, borderTop: `1.5px solid ${COLORS.border}` },
  cartTotalRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 },
  cartTotalNum: { fontSize: 24, fontWeight: 900, color: COLORS.ink, letterSpacing: "-0.02em" },
  chargeBtn: { width: "100%", padding: "17px", borderRadius: 14, border: "none", background: COLORS.red, color: "#fff", fontWeight: 800, fontSize: 16.5, cursor: "pointer", boxShadow: "0 4px 14px rgba(130,45,27,0.28)" },
  chargeBtnDisabled: { background: "#E4DAD3", color: "#A8998F", boxShadow: "none", cursor: "not-allowed" },

  // Modal
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(46,27,21,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(2px)", overflowY: "auto", padding: "24px 12px" },
  modalCard: { background: "#fff", borderRadius: 22, padding: 28, width: "100%", maxWidth: 380, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
  modalTitle: { fontWeight: 800, fontSize: 18, color: COLORS.ink, marginBottom: 14, textAlign: "center" },
  modalTotal: { fontSize: 32, fontWeight: 900, color: COLORS.redDark, textAlign: "center", marginBottom: 20, letterSpacing: "-0.02em" },
  payMethods: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 },
  payBtn: { padding: "13px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: "#fff", fontSize: 14.5, fontWeight: 700, color: COLORS.inkSoft, cursor: "pointer", textAlign: "left", paddingLeft: 18 },
  payBtnActive: { borderColor: COLORS.red, background: COLORS.redSoft, color: COLORS.redDark },
  payBtnActivePendiente: { borderColor: "#B8860B", background: "#FBF3DC", color: "#8A6D1D" },
  pendienteNote: { fontSize: 11.5, color: COLORS.muted, textAlign: "center", lineHeight: 1.5, marginBottom: 18, padding: "0 4px" },
  vueltoBlock: { marginBottom: 20 },
  vueltoResult: { textAlign: "center", fontWeight: 800, fontSize: 15, marginTop: 10 },
  tipoVentaRow: { display: "flex", gap: 8, marginBottom: 16, background: "#F8EAD7", padding: 4, borderRadius: 12 },
  entregaLabel: { fontSize: 12, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 },
  entregaRow: { display: "flex", gap: 8, marginBottom: 16 },
  entregaBtn: { position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 4px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 11.5, cursor: "pointer", lineHeight: 1.2, textAlign: "center" },
  entregaBtnActive: { borderColor: COLORS.redDark, background: COLORS.red, color: "#fff", borderWidth: 3, boxShadow: "0 4px 12px rgba(130,45,27,0.45)", transform: "scale(1.04)" },
  entregaCheck: { position: "absolute", top: 4, right: 6, fontSize: 14, fontWeight: 900, color: "#fff" },
  entregaChip: { fontSize: 11, fontWeight: 800, color: "#3A5FA0", background: "#EAF3FB", padding: "2px 8px", borderRadius: 7, flexShrink: 0 },
  tipoVentaBtn: { flex: 1, padding: "10px", borderRadius: 9, border: "none", background: "transparent", color: COLORS.inkSoft, fontWeight: 700, fontSize: 13, cursor: "pointer" },
  tipoVentaBtnActive: { background: "#fff", color: COLORS.redDark, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  tipoVentaBtnActiveInterno: { background: "#fff", color: "#8A6D1D", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  socioBlock: { marginBottom: 6 },
  socioLabel: { fontSize: 13, fontWeight: 700, color: COLORS.inkSoft, marginBottom: 10, textAlign: "center" },
  socioRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 },
  socioBtn: { padding: "13px 6px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 13, cursor: "pointer" },
  cobrarBlock: { background: "#FBF3DC", borderRadius: 14, padding: "16px 14px", marginBottom: 16 },
  cobrarAhoraBtn: { width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#B8860B", color: "#fff", fontWeight: 800, fontSize: 14.5, cursor: "pointer" },
  cobrarBtn: { flex: 1, padding: "13px 6px", borderRadius: 12, border: "1.5px solid #E4CE8A", background: "#fff", color: "#8A6D1D", fontWeight: 700, fontSize: 12.5, cursor: "pointer" },
  socioBtnActive: { borderColor: "#D4AF37", background: "#FBF3DC", color: "#8A6D1D" },
  socioNote: { fontSize: 11.5, color: COLORS.muted, textAlign: "center", lineHeight: 1.4, marginBottom: 8 },
  avisarBlock: { marginBottom: 18 },
  avisarCheckboxRow: { display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 600, color: COLORS.inkSoft, cursor: "pointer" },
  checkbox: { width: 18, height: 18, cursor: "pointer", accentColor: COLORS.red },
  mixtoBlock: { background: "#F8EAD7", borderRadius: 12, padding: "14px", marginBottom: 20 },
  mixtoRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  mixtoLabel: { fontSize: 13.5, fontWeight: 700, color: COLORS.inkSoft, flexShrink: 0 },
  mixtoInput: { width: 120, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: "right" },
  numeroPedidoBox: { textAlign: "center", background: "#F8EAD7", border: `2px solid ${COLORS.border}`, borderRadius: 14, padding: "10px 14px", marginBottom: 20 },
  numeroPedidoLabel: { fontSize: 11.5, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.06em" },
  numeroPedidoValor: { fontSize: 42, fontWeight: 900, color: COLORS.redDark, lineHeight: 1.1 },
  numPedidoChip: { fontSize: 12, fontWeight: 900, color: "#fff", background: COLORS.ink, padding: "2px 8px", borderRadius: 7, flexShrink: 0 },
  numPedidoTitulo: { fontSize: 14, fontWeight: 900, color: "#fff", background: COLORS.ink, padding: "3px 9px", borderRadius: 7, marginRight: 9 },
  ventaOkIcon: { width: 52, height: 52, borderRadius: 99, background: COLORS.green, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" },
  printBtn: { flex: 1, padding: "13px 6px", borderRadius: 12, border: "none", background: COLORS.ink, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13.5 },
  printBtnRecibo: { flex: 1, padding: "13px 6px", borderRadius: 12, border: "none", background: "#2E9E5B", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13.5 },
  modalActions: { display: "flex", gap: 10 },
  modalCancel: { flex: 1, padding: "13px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, cursor: "pointer" },
  modalConfirm: { flex: 1.4, padding: "13px", borderRadius: 12, border: "none", background: COLORS.green, color: "#fff", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },

  // Stats
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 },
  statCard: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 16, padding: 18, display: "flex", alignItems: "center", gap: 14 },
  statIcon: { width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statValue: { fontSize: 19, fontWeight: 900, color: COLORS.ink, letterSpacing: "-0.01em" },
  statLabel: { fontSize: 12, color: COLORS.muted, fontWeight: 600, marginTop: 2 },

  // Table (Inventario)
  invTopRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  newInsumoBtn: { display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 12, border: "none", background: COLORS.ink, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  tableCard: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 18, overflow: "hidden" },
  tableHead: { display: "flex", padding: "14px 20px", background: "#FAF5F0", fontSize: 12, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.02em" },
  tableBody: {},
  tableRow: { display: "flex", alignItems: "center", padding: "14px 20px", borderTop: `1px solid #F5EEE9`, fontSize: 14 },
  tableRowLow: { background: "#FDF6F5" },
  tableRowInactive: { background: "#FAFAFA", opacity: 0.75 },
  tableRowTotal: { display: "flex", alignItems: "center", padding: "14px 20px", borderTop: `2px solid ${COLORS.border}`, background: "#FAF5F0", fontSize: 14 },
  lowBadge: { marginLeft: 8, fontSize: 10, fontWeight: 800, color: "#B4271A", background: "#FBEEEC", padding: "2px 7px", borderRadius: 99 },
  inactiveBadge: { marginLeft: 8, fontSize: 10, fontWeight: 800, color: COLORS.muted, background: "#EDE6DF", padding: "2px 7px", borderRadius: 99 },
  editableVal: { cursor: "pointer", borderBottom: `1.5px dashed ${COLORS.muted}`, paddingBottom: 1, color: COLORS.inkSoft, fontWeight: 600 },
  inlineInput: { width: 60, padding: "5px 8px", borderRadius: 8, border: `1.5px solid ${COLORS.red}`, fontSize: 13.5, fontWeight: 700 },
  inlineInputSmall: { width: 60, padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${COLORS.border}`, fontSize: 13 },
  addStockRow: { display: "flex", alignItems: "center", gap: 6 },
  addStockBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.red, cursor: "pointer" },
  iconActionBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, cursor: "pointer" },
  iconActionBtnDanger: { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, border: `1.5px solid #F3D4CE`, background: "#FDF1EF", color: "#B4271A", cursor: "pointer" },
  miniBtnOk: { width: 28, height: 28, borderRadius: 8, border: "none", background: COLORS.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  miniBtnX: { width: 28, height: 28, borderRadius: 8, border: "none", background: "#F3ECE6", color: COLORS.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  usedInBox: { fontSize: 12.5, color: COLORS.inkSoft, background: "#F8EAD7", padding: "10px 14px", borderRadius: 10, marginBottom: 16, lineHeight: 1.5 },
  usedInBoxDanger: { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "#B4271A", background: "#FBEEEC", padding: "10px 14px", borderRadius: 10, marginBottom: 16, lineHeight: 1.5 },
  formField: { marginBottom: 14 },
  formRow: { display: "flex", gap: 12 },
  formLabel: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.02em" },
  productosSection: { marginTop: 24 },
  ajusteBtn: { border: `1.5px solid #E4CE8A`, background: "#FFFBF0", color: "#8A6D1D", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  stockLockNote: { fontSize: 11.5, color: COLORS.inkSoft, background: "#F8EAD7", borderRadius: 10, padding: "10px 12px", lineHeight: 1.5, marginBottom: 4 },
  bitacoraAlerta: { fontSize: 11.5, fontWeight: 800, color: "#8A6D1D", background: "#FBF3DC", padding: "5px 12px", borderRadius: 99 },
  bitacoraList: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 16, overflow: "hidden", maxHeight: 420, overflowY: "auto" },
  bitacoraRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: `1px solid #F5EEE9` },
  bitacoraLeft: { flex: 1, minWidth: 0 },
  bitacoraTop: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  bitacoraTag: { fontSize: 9.5, fontWeight: 800, padding: "3px 8px", borderRadius: 99, letterSpacing: "0.03em" },
  bitacoraInsumo: { fontSize: 13.5, fontWeight: 700, color: COLORS.ink },
  bitacoraSub: { fontSize: 11.5, color: COLORS.muted, fontWeight: 600, marginTop: 3 },
  bitacoraRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 },
  bitacoraDelta: { fontSize: 15, fontWeight: 900 },
  bitacoraStocks: { fontSize: 11, color: COLORS.muted, fontWeight: 600, marginTop: 2 },
  motivoList: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  motivoBtn: { padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left" },
  motivoBtnActive: { borderColor: COLORS.red, background: COLORS.redSoft, color: COLORS.redDark },
  ajusteAviso: { fontSize: 11.5, color: COLORS.muted, textAlign: "center", lineHeight: 1.5, marginBottom: 14 },
  consumoHelp: { fontSize: 12, color: COLORS.muted, lineHeight: 1.5, marginBottom: 12 },
  consumoChips: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  consumoChip: { display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 14px", borderRadius: 99, border: `1.5px solid ${COLORS.border}`, background: "#fff", fontSize: 13.5, fontWeight: 700, color: COLORS.ink },
  consumoChipDel: { border: "none", background: "#FBEEEC", color: "#B4271A", borderRadius: 99, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  consumoAddRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  productosHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" },
  productosList: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 16, overflow: "hidden" },
  productoRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid #F5EEE9` },
  productoNombre: { fontSize: 14.5, fontWeight: 700, color: COLORS.ink },
  productoMeta: { fontSize: 12.5, color: COLORS.inkSoft, fontWeight: 600, marginTop: 3 },
  productoInsumos: { color: COLORS.muted, fontWeight: 500 },
  productoActions: { display: "flex", gap: 6, flexShrink: 0 },
  catToggle: { display: "flex", gap: 8, marginBottom: 16 },
  catToggleBtn: { flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  catToggleActive: { borderColor: COLORS.red, background: COLORS.redSoft, color: COLORS.redDark },
  recipeHelp: { fontSize: 11.5, color: COLORS.muted, lineHeight: 1.5, marginBottom: 12 },
  recipeRow: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
  recipeSelect: { flex: 1, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 13.5, fontWeight: 600, color: COLORS.ink, background: "#fff", minWidth: 0 },
  recipeCant: { width: 70, padding: "10px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 14, fontWeight: 700, textAlign: "center" },
  recipeDelBtn: { border: "none", background: "#FBEEEC", color: "#B4271A", borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  recipeAddBtn: { display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: `1.5px dashed ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginTop: 4 },
  formInput: { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, fontSize: 14.5, fontWeight: 600, color: COLORS.ink, background: "#fff" },

  // Caja
  cajaClosedWrap: { display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 40 },
  cajaClosedCard: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 22, padding: 36, width: 420, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  cajaClosedIcon: { width: 60, height: 60, borderRadius: 16, background: COLORS.redSoft, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  cajaClosedTitle: { fontSize: 19, fontWeight: 800, color: COLORS.ink },
  cajaClosedSub: { fontSize: 13.5, color: COLORS.muted, marginTop: 6, marginBottom: 22 },
  cajaInput: { width: "100%", padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 15, fontWeight: 700, color: COLORS.ink, textAlign: "center" },
  cajaOpenBtn: { width: "100%", padding: "15px", borderRadius: 12, border: "none", background: COLORS.red, color: "#fff", fontWeight: 800, fontSize: 15.5, cursor: "pointer", marginTop: 14 },

  cajaBreakdown: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 18, padding: 22, marginBottom: 16 },
  breakdownTitle: { fontSize: 13, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 14 },
  breakRow: { display: "flex", justifyContent: "space-between", padding: "8px 0" },
  breakLabel: { fontSize: 14, color: COLORS.inkSoft, fontWeight: 600 },
  breakValue: {},
  breakdownDivider: { height: 1, background: COLORS.border, margin: "8px 0" },

  cajaActions: { display: "flex", gap: 10, marginBottom: 16 },
  movBtnIn: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", borderRadius: 12, border: `1.5px solid #CDEBD9`, background: "#EAF7EF", color: "#1D7A44", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  movBtnOut: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", borderRadius: 12, border: `1.5px solid #F3D4CE`, background: "#FDF1EF", color: "#B4271A", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  closeCajaBtn: { flex: 1.3, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", borderRadius: 12, border: "none", background: COLORS.ink, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },

  movList: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 18, padding: 22, marginBottom: 16 },
  movRow: { display: "flex", justifyContent: "space-between", padding: "9px 0", borderTop: `1px solid #F5EEE9`, fontSize: 13.5 },
  movMotivo: { color: COLORS.muted, fontWeight: 500 },

  historyBlock: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 18, padding: 22, marginTop: 8 },
  historyRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: `1px solid #F5EEE9` },
  historyRowBtn: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", width: "100%", background: "transparent", border: "none", borderTop: `1px solid #F5EEE9`, cursor: "pointer", textAlign: "left" },
  historyRight: { display: "flex", alignItems: "center", gap: 8 },
  historyDate: { fontWeight: 700, fontSize: 14, color: COLORS.ink, textTransform: "capitalize" },
  historySub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  historyDiff: { fontWeight: 800, fontSize: 13.5 },

  cierreEsperado: { textAlign: "center", fontSize: 14, color: COLORS.inkSoft, marginBottom: 14 },
  diffPreview: { textAlign: "center", fontWeight: 800, fontSize: 14, marginTop: 10 },
  cajaBreakdown2: { background: "#F8EAD7", borderRadius: 14, padding: "16px 18px", marginBottom: 18 },
  turnoVentasList: { maxHeight: 220, overflow: "auto", marginBottom: 18, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "4px 14px" },
  turnoVentaRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid #F5EEE9` },
  turnoVentaLeft: { display: "flex", flexDirection: "column", gap: 2 },
  turnoVentaSub: { fontSize: 11.5, color: COLORS.muted, fontWeight: 600 },
  exportLabel: { fontSize: 12, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10, textAlign: "center" },
  exportRow: { display: "flex", gap: 10, marginBottom: 10 },
  exportBtn: { flex: 1, padding: "16px 10px", borderRadius: 14, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink, fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "center" },
  exportBtnPdf: { flex: 1, padding: "16px 10px", borderRadius: 14, border: "none", background: COLORS.ink, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "center" },

  // Historial
  histTopRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" },
  histFilters: { display: "flex", gap: 8 },
  searchInput: { flex: 1, minWidth: 220, maxWidth: 340, padding: "10px 16px", borderRadius: 99, border: `1.5px solid ${COLORS.border}`, fontSize: 13.5, fontWeight: 600, color: COLORS.ink },
  histSummaryBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 4px", fontSize: 13, fontWeight: 700, color: COLORS.muted, marginBottom: 6, flexWrap: "wrap" },
  agrupacionRow: { display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: COLORS.muted },
  agrupacionBtn: { padding: "5px 12px", borderRadius: 99, border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  agrupacionBtnActive: { background: COLORS.ink, borderColor: COLORS.ink, color: "#fff" },
  grupoBloque: { marginBottom: 22 },
  grupoHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, padding: "0 4px 10px", borderBottom: `2px solid ${COLORS.border}`, marginBottom: 10 },
  grupoTitulo: { fontSize: 15.5, fontWeight: 900, color: COLORS.ink, textTransform: "capitalize", letterSpacing: "-0.01em" },
  grupoSub: { fontSize: 11.5, color: COLORS.muted, fontWeight: 600, marginTop: 3 },
  grupoTotal: { fontSize: 17, fontWeight: 900, color: COLORS.redDark, whiteSpace: "nowrap" },
  verResumenBtn: { width: "100%", padding: "8px", borderRadius: 9, border: "none", background: "transparent", color: COLORS.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer", marginBottom: 8, textAlign: "left" },
  grupoResumen: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 },
  grupoResumenRow: { display: "flex", alignItems: "center", gap: 10, padding: "5px 0", fontSize: 13 },
  grupoResumenCant: { fontWeight: 900, color: COLORS.redDark, minWidth: 32 },
  grupoResumenNombre: { flex: 1, fontWeight: 600, color: COLORS.ink, minWidth: 0 },
  grupoResumenValor: { fontWeight: 700, color: COLORS.inkSoft, whiteSpace: "nowrap" },
  grupoResumenDivider: { height: 1, background: COLORS.border, margin: "10px 0" },
  grupoResumenPagos: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft },
  histList: { display: "flex", flexDirection: "column", gap: 8 },
  histRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 14, padding: "14px 18px", cursor: "pointer", textAlign: "left", width: "100%" },
  histRowAnulada: { background: "#FAF7F5", opacity: 0.72 },
  histRowPendiente: { background: "#FFFBF0", borderColor: "#E4CE8A" },
  histRowLeft: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  histRowTop: { display: "flex", alignItems: "center", gap: 8 },
  histRowName: { fontWeight: 800, fontSize: 14.5, color: COLORS.ink },
  histRowSub: { fontSize: 12, color: COLORS.muted, fontWeight: 600, textTransform: "capitalize" },
  histRowRight: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  histRowTotal: { fontWeight: 800, fontSize: 15, color: COLORS.ink },
  anuladaTag: { fontSize: 10, fontWeight: 800, color: "#B4271A", background: "#FBEEEC", padding: "2px 8px", borderRadius: 99, letterSpacing: "0.02em" },
  editadaTag: { fontSize: 10, fontWeight: 800, color: "#8A6D1D", background: "#FBF3DC", padding: "2px 8px", borderRadius: 99, letterSpacing: "0.02em" },
  internoTag: { fontSize: 10, fontWeight: 800, color: "#3A5FA0", background: "#EAF3FB", padding: "2px 8px", borderRadius: 99, letterSpacing: "0.02em" },
  pendienteTag: { fontSize: 10, fontWeight: 800, color: "#8A6D1D", background: "#FBF3DC", padding: "2px 8px", borderRadius: 99, letterSpacing: "0.02em" },
  internoBanner: { display: "flex", alignItems: "center", gap: 8, background: "#EAF3FB", color: "#3A5FA0", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16 },
  pendienteBanner: { display: "flex", alignItems: "center", gap: 8, background: "#FBF3DC", color: "#8A6D1D", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16 },
  localizadorBanner: { display: "flex", alignItems: "center", gap: 8, background: "#EAF3FB", color: "#3A5FA0", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16 },
  pendientesBanner: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "14px 18px", borderRadius: 14, border: "1.5px solid #E4CE8A", background: "#FFFBF0", cursor: "pointer", marginBottom: 16 },
  pendientesBannerLeft: { display: "flex", alignItems: "center", gap: 9, color: "#8A6D1D", fontWeight: 700, fontSize: 14 },
  pendientesBannerTotal: { fontWeight: 900, fontSize: 16, color: "#8A6D1D" },
  reprintRow: { display: "flex", gap: 10, marginBottom: 14 },
  reprintBtn: { flex: 1, padding: "12px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 13.5, cursor: "pointer" },

  modalCardWide: { background: "#fff", borderRadius: 22, padding: 28, width: "100%", maxWidth: 440, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" },
  detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  detailMeta: { fontSize: 12.5, color: COLORS.muted, fontWeight: 600, marginTop: 4, textTransform: "capitalize" },
  closeX: { border: "none", background: "#F3ECE6", color: COLORS.inkSoft, width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  anuladaBanner: { display: "flex", alignItems: "center", gap: 8, background: "#FBEEEC", color: "#B4271A", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, marginBottom: 16 },
  detailItems: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  detailItemRow: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid #F5EEE9`, fontSize: 13.5, color: COLORS.inkSoft, fontWeight: 600 },
  detailItemNota: { fontSize: 12, color: "#8A6D1D", fontWeight: 600, paddingBottom: 6, paddingLeft: 4 },
  detailTotalRow: { display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: `1.5px solid ${COLORS.border}`, fontWeight: 900, fontSize: 17, color: COLORS.ink, marginBottom: 6 },
  descuentoBlock: { background: "#F8EAD7", borderRadius: 12, padding: "12px 14px", marginTop: 10 },
  descTipoRow: { display: "flex", gap: 8 },
  descTipoBtn: { flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 13, cursor: "pointer" },
  descTipoActive: { borderColor: COLORS.red, background: COLORS.redSoft, color: COLORS.redDark },
  descResumen: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12, padding: "10px 12px", background: "#fff", borderRadius: 10, fontSize: 13, fontWeight: 700, color: COLORS.inkSoft, flexWrap: "wrap" },
  modalTotalTachado: { fontSize: 16, fontWeight: 700, color: COLORS.muted, textDecoration: "line-through" },
  modalDescBadge: { display: "inline-block", fontSize: 12, fontWeight: 800, color: "#B4271A", background: "#FBEEEC", padding: "3px 12px", borderRadius: 99, marginTop: 4 },
  detailDescuento: { background: "#FDF6F5", borderRadius: 10, padding: "10px 12px", marginBottom: 8 },
  detailSubRow: { fontSize: 12.5, color: COLORS.muted, fontWeight: 600, marginBottom: 16 },
  modalEditBtn: { flex: 1, padding: "13px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink, fontWeight: 700, cursor: "pointer" },
  modalAnularBtn: { flex: 1, padding: "13px", borderRadius: 12, border: "none", background: "#FBEEEC", color: "#B4271A", fontWeight: 700, cursor: "pointer" },
  modalAnularConfirmBtn: { flex: 1.4, padding: "13px", borderRadius: 12, border: "none", background: "#B4271A", color: "#fff", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  editItemBlock: { borderBottom: `1px solid #F5EEE9` },
  addProductBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "12px", borderRadius: 12, border: `1.5px dashed ${COLORS.red}`, background: "#FDF6F5", color: COLORS.redDark, fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginTop: 12, marginBottom: 12 },
  addProductPanel: { background: "#FDF6F5", border: `1.5px solid ${COLORS.border}`, borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 12 },
  addProductHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 800, color: COLORS.inkSoft, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.03em" },
  addProductList: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" },
  addProductItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: "#fff", cursor: "pointer", textAlign: "left" },
  addProductItemDisabled: { opacity: 0.5, cursor: "not-allowed" },
  addProductName: { fontSize: 13.5, fontWeight: 700, color: COLORS.ink },
  addProductPrice: { fontSize: 12, color: COLORS.muted, fontWeight: 600, marginTop: 2 },
  addedItemsPreview: { background: "#F8EAD7", borderRadius: 10, padding: "10px 14px", marginBottom: 16 },
  addedItemLine: { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13.5, fontWeight: 700, color: COLORS.ink },
  addedItemNote: { fontSize: 11.5, color: COLORS.muted, fontStyle: "italic", fontWeight: 500 },
  editItemRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0 4px" },

  // Reportes
  rangeRow: { display: "flex", gap: 8, marginBottom: 16 },
  rangeBtn: { padding: "9px 18px", borderRadius: 99, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.inkSoft, fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  rangeBtnActive: { background: COLORS.ink, borderColor: COLORS.ink, color: "#fff" },

  chartCard: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 18, padding: 22, marginBottom: 16 },
  fechaBloque: { borderBottom: `1px solid #F5EEE9` },
  fechaHeader: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 2px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" },
  fechaTitulo: { fontSize: 14.5, fontWeight: 800, color: COLORS.ink, textTransform: "capitalize" },
  fechaSub: { fontSize: 12.5, color: COLORS.muted, fontWeight: 600, marginTop: 2 },
  fechaChevron: { fontSize: 12, color: COLORS.muted, flexShrink: 0, marginLeft: 10 },
  fechaDetalle: { paddingBottom: 12, paddingLeft: 4 },
  fechaProdRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13.5 },
  fechaProdCant: { fontWeight: 900, color: COLORS.redDark, minWidth: 36 },
  fechaProdNombre: { flex: 1, fontWeight: 600, color: COLORS.ink, minWidth: 0 },
  fechaProdValor: { fontWeight: 700, color: COLORS.inkSoft, whiteSpace: "nowrap" },
  barsRow: { display: "flex", alignItems: "flex-end", gap: 10, height: 140, marginTop: 8 },
  barCol: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" },
  barTrack: { flex: 1, width: "100%", display: "flex", alignItems: "flex-end", background: "#F8EAD7", borderRadius: 8, overflow: "hidden" },
  barFill: { width: "100%", background: `linear-gradient(180deg, ${COLORS.red}, ${COLORS.redDark})`, borderRadius: "8px 8px 0 0", transition: "height 300ms ease" },
  barLabel: { fontSize: 11, fontWeight: 700, color: COLORS.muted, marginTop: 8, textTransform: "capitalize" },

  topProdRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0" },
  topProdName: { width: 150, fontSize: 13.5, fontWeight: 700, color: COLORS.ink, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  topProdBarTrack: { flex: 1, height: 10, background: "#F3ECE6", borderRadius: 99, overflow: "hidden" },
  topProdBarFill: { height: "100%", background: COLORS.red, borderRadius: 99 },
  topProdCant: { width: 24, textAlign: "right", fontSize: 13, fontWeight: 800, color: COLORS.inkSoft },
  internoTotalRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid #F5EEE9` },
  internoTotalVal: { fontSize: 18, fontWeight: 900, color: "#3A5FA0" },
  emptyState: { textAlign: "center", padding: 30, color: COLORS.muted, fontSize: 13.5, fontWeight: 600 },
  fixDateCard: { background: "#FDF6F5", border: "1.5px solid #F3D4CE", borderRadius: 16, padding: 20, marginTop: 16 },
  fixDateHeader: { display: "flex", alignItems: "center", gap: 9, fontWeight: 800, fontSize: 14, color: "#B4271A", marginBottom: 8 },
  fixDateText: { fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.6, marginBottom: 14 },
  fixDateBtn: { padding: "12px 20px", borderRadius: 12, border: "none", background: "#B4271A", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  backupCard: { background: "#fff", border: `1.5px solid ${COLORS.border}`, borderRadius: 16, padding: 22, marginTop: 16 },
  backupTitle: { fontSize: 13, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 },
  backupText: { fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.6, marginBottom: 16 },
  backupActions: { display: "flex", gap: 10, flexWrap: "wrap" },
  backupBtn: { display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: 12, border: "none", background: COLORS.ink, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  backupBtnImport: { display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink, fontWeight: 700, fontSize: 13.5, cursor: "pointer" },

  toast: { position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#fff", border: "1.5px solid", borderRadius: 14, padding: "13px 22px", display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 14, color: COLORS.ink, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", zIndex: 200 },
};

const globalCss = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
  .app-content { overscroll-behavior: contain; }
  .modal-backdrop, .sheet-backdrop, .modal-card { overscroll-behavior: contain; }
  /* Con un modal abierto, la pantalla de atrás no se mueve */
  body.modal-open .app-content { overflow: hidden !important; }
  button { font-family: inherit; }
  input { font-family: inherit; outline: none; }
  input:focus { border-color: ${COLORS.red} !important; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #DCCFC5; border-radius: 99px; }
  ::-webkit-scrollbar-track { background: transparent; }
  .spin { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  button:active { transform: scale(0.97); }
  @media (prefers-reduced-motion: reduce) {
    .spin { animation: none; }
    button:active { transform: none; }
  }

  /* ===== Adaptación a pantallas chicas (celular) ===== */
  @media (max-width: 820px) {
    /* Tarjetas de estadísticas: de 3 columnas a 1 */
    .stats-row { grid-template-columns: 1fr !important; gap: 10px !important; margin-bottom: 12px !important; }

    /* Modales: ocupan el ancho disponible en vez de un ancho fijo */
    .modal-card { width: 100% !important; max-width: 100% !important; padding: 20px !important; border-radius: 18px !important; }
    .modal-backdrop { padding: 12px !important; align-items: flex-start !important; }
    /* Alto real de la pantalla del celular (la barra del navegador no cuenta) */
    .modal-card { max-height: calc(100dvh - 24px) !important; -webkit-overflow-scrolling: touch; }

    /* Tablas: permitir scroll horizontal en vez de aplastar las columnas */
    .table-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
    .table-scroll > div { min-width: 560px; }

    /* Filas de acciones que se salen de pantalla */
    .caja-actions { flex-wrap: wrap !important; }
    .caja-actions > button { flex: 1 1 100% !important; }
    .export-row { flex-wrap: wrap !important; }
    .export-row > button { flex: 1 1 100% !important; }
    .backup-actions > button { flex: 1 1 100% !important; }

    /* Grilla de productos del POS: tarjetas más chicas */
    .items-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important; gap: 10px !important; }

    /* Historial: buscador a ancho completo bajo los filtros */
    .hist-top-row { flex-direction: column !important; align-items: stretch !important; }
    .search-input { max-width: 100% !important; }
    .hist-filters { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
    .hist-filters > button { flex-shrink: 0; }

    /* Rangos de reportes */
    .range-row { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
    .range-row > button { flex-shrink: 0; }

    /* Toast por encima de la barra inferior */
    .toast-msg { bottom: 84px !important; width: calc(100% - 32px); max-width: 420px; justify-content: center; }
  }

  @media print {
    body * { visibility: hidden; }
    #comanda-print-area, #comanda-print-area *,
    #recibo-print-area, #recibo-print-area *,
    #reporte-print-area, #reporte-print-area * { visibility: visible; }
    #comanda-print-area, #recibo-print-area, #reporte-print-area { display: block !important; position: absolute; top: 0; left: 0; width: 100%; }
    /* Las impresoras térmicas no imprimen fondos: forzar todo a negro sobre blanco */
    #comanda-print-area *, #recibo-print-area *, #reporte-print-area * {
      background: transparent !important;
      color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Recibo: trazo un poco más grueso para que la térmica no lo deje delgado */
    #recibo-print-area * { -webkit-text-stroke: 0.4px #000; }
    /* Comanda + recibo en un solo envío: se oculta la app y los dos tickets fluyen uno por página */
    body.printing-tickets > *:not(#tickets-print-root) { display: none !important; }
    body.printing-tickets #tickets-print-root #comanda-print-area,
    body.printing-tickets #tickets-print-root #recibo-print-area { position: static !important; }
    body.printing-tickets #tickets-print-root #comanda-print-area { break-after: page; page-break-after: always; }
    @page { margin: 10mm; }
  }
  .section-tabs::-webkit-scrollbar, .cat-row::-webkit-scrollbar { display: none; }
`;
