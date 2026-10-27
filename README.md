# Mapa de Oportunidades con IA 🌐🤖

Una aplicación web pública, colaborativa y en tiempo real para publicar, descubrir y votar oportunidades de negocio basadas en retos urbanos y soluciones con Inteligencia Artificial.

---

## ⚡ Tecnologías y Arquitectura

- **Frontend:** HTML5 semántico, CSS3 moderno (Glassmorphism, animaciones fluidas, diseño responsive) y JavaScript Vanilla (ES6+).
- **Backend / Base de Datos:** **Supabase** (PostgreSQL + Row Level Security + Realtime).
- **Acceso:** 100% público. Cualquier persona con el enlace puede explorar todas las oportunidades, filtrarlas, publicar nuevas ideas y dar likes en tiempo real sin requerir registro previo.

---

## 📋 Estructura de la Tabla en Supabase (`opportunities`)

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `BIGINT` | Identificador único autoincremental (Clave primaria) |
| `name` | `TEXT` | Nombre o título de la oportunidad |
| `city` | `TEXT` | Ciudad donde se detectó el problema |
| `country` | `TEXT` | País de la ciudad |
| `problem` | `TEXT` | Reto o necesidad detectada |
| `ai_solution` | `TEXT` | Solución técnica propuesta basada en Inteligencia Artificial |
| `category` | `TEXT` | Categoría (Sostenibilidad, Salud, Comercio, Movilidad, etc.) |
| `potential` | `TEXT` | Nivel de potencial de negocio (`Alto`, `Medio`, `Bajo`) |
| `likes` | `INTEGER` | Contador de votos de la comunidad (por defecto 0) |
| `created_at` | `TIMESTAMPTZ` | Marca de tiempo de publicación (UTC) |

---

## 🚀 Cómo ejecutar la aplicación localmente

La app está lista para ser servida por cualquier servidor web estático. Por ejemplo:

```bash
# Con Python
python3 -m http.server 8080

# O con Node / npx
npx serve .
```

Abre tu navegador en: [http://localhost:8080](http://localhost:8080).

---

## 👥 Cómo probar que una oportunidad publicada por una persona aparece para otra persona

Para comprobar que los datos no se guardan localmente y que dos personas distintas ven lo mismo en tiempo real:

1. **Abre dos ventanas diferentes del navegador:**
   - **Ventana A:** Tu navegador habitual en `http://localhost:8080`.
   - **Ventana B:** Una ventana en **Modo Incógnito / Privado** (o un navegador diferente como Safari/Firefox/Chrome o desde otro dispositivo/móvil conectado a la misma red).
2. **Publica una nueva oportunidad desde la Ventana A:**
   - Haz clic en **"+ Publicar Oportunidad"**.
   - Rellena los datos (ej: *Triaje Rápido en Farmacias* en *Sevilla, España*) y pulsa **"Publicar en la Red Pública"**.
3. **Observa la Ventana B:**
   - Gracias a la sincronización en tiempo real con **Supabase Realtime**, la nueva tarjeta aparecerá inmediatamente en la Ventana B sin necesidad de recargar la página.
   - También puedes recargar manualmente la Ventana B para confirmar que los datos se leen directamente desde la base de datos central de Supabase.
4. **Prueba los Likes:**
   - Haz clic en el botón de **Like** (❤️) de cualquier tarjeta desde la Ventana B.
   - Verás cómo el contador de likes se incrementa tanto en la Ventana B como en la Ventana A y queda guardado en Supabase.