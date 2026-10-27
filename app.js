/**
 * Mapa de Oportunidades con IA
 * Conexión completa y pública con Supabase DB + Realtime
 */

// Supabase Configuration
const SUPABASE_URL = 'https://ktowlthgkrfwpungievv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0b3dsdGhna3Jmd3B1bmdpZXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMDk1NjMsImV4cCI6MjEwODY4NTU2M30.so7-vP82awTUYovEb9yM2jZ9f6VsTIC9TIPgsSx9L1U';

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Management
let allOpportunities = [];
let localLikedIds = new Set(JSON.parse(localStorage.getItem('liked_opportunities_ids') || '[]'));

// DOM Elements
const opportunitiesGrid = document.getElementById('opportunitiesGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const visibleCount = document.getElementById('visibleCount');
const realtimeStatus = document.getElementById('realtimeStatus');

// Stats Elements
const statTotalOpportunities = document.getElementById('statTotalOpportunities');
const statTotalCities = document.getElementById('statTotalCities');
const statTotalCountries = document.getElementById('statTotalCountries');
const statTotalLikes = document.getElementById('statTotalLikes');

// Filter Elements
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const filterCountry = document.getElementById('filterCountry');
const filterCity = document.getElementById('filterCity');
const filterCategory = document.getElementById('filterCategory');
const sortBy = document.getElementById('sortBy');
const btnResetFilters = document.getElementById('btnResetFilters');
const btnEmptyReset = document.getElementById('btnEmptyReset');

// Modal Elements
const opportunityModal = document.getElementById('opportunityModal');
const btnOpenModal = document.getElementById('btnOpenModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const opportunityForm = document.getElementById('opportunityForm');
const btnSubmitOpportunity = document.getElementById('btnSubmitOpportunity');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

/* ==========================================================================
   Supabase Data Operations
   ========================================================================== */

/**
 * Fetch all opportunities from Supabase
 */
async function loadOpportunities() {
  try {
    const { data, error } = await supabaseClient
      .from('opportunities')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching opportunities:', error);
      showToast('Error al cargar datos de Supabase: ' + error.message, 'error');
      loadingState.style.display = 'none';
      return;
    }

    allOpportunities = data || [];
    loadingState.style.display = 'none';
    
    populateDynamicFilters();
    renderFilteredOpportunities();
    updateMetrics();
  } catch (err) {
    console.error('Unexpected error:', err);
    showToast('Error de conexión con el servidor', 'error');
    loadingState.style.display = 'none';
  }
}

/**
 * Insert a new opportunity into Supabase
 */
async function createOpportunity(formData) {
  const submitBtnText = btnSubmitOpportunity.querySelector('.btn-text');
  const submitBtnSpinner = btnSubmitOpportunity.querySelector('.btn-spinner');
  
  try {
    // Disable button & show spinner
    btnSubmitOpportunity.disabled = true;
    submitBtnText.textContent = 'Publicando...';
    submitBtnSpinner.style.display = 'inline-block';

    const newRecord = {
      name: formData.name.trim(),
      city: formData.city.trim(),
      country: formData.country.trim(),
      problem: formData.problem.trim(),
      ai_solution: formData.ai_solution.trim(),
      category: formData.category,
      potential: formData.potential,
      likes: 0
    };

    const { data, error } = await supabaseClient
      .from('opportunities')
      .insert([newRecord])
      .select();

    if (error) {
      console.error('Error inserting opportunity:', error);
      showToast('No se pudo guardar: ' + error.message, 'error');
      return false;
    }

    showToast('🚀 ¡Oportunidad publicada con éxito para todos!', 'success');
    closeModal();
    opportunityForm.reset();

    // Reload list to ensure fresh data
    await loadOpportunities();
    return true;
  } catch (err) {
    console.error('Error during creation:', err);
    showToast('Ocurrió un error inesperado al publicar', 'error');
    return false;
  } finally {
    btnSubmitOpportunity.disabled = false;
    submitBtnText.textContent = 'Publicar en la Red Pública';
    submitBtnSpinner.style.display = 'none';
  }
}

/**
 * Increment like counter for an opportunity in Supabase
 */
async function handleLike(opportunityId) {
  const item = allOpportunities.find(o => o.id === opportunityId);
  if (!item) return;

  const isLiked = localLikedIds.has(opportunityId);
  const newLikesCount = item.likes + 1;

  // Optimistic UI update
  item.likes = newLikesCount;
  localLikedIds.add(opportunityId);
  localStorage.setItem('liked_opportunities_ids', JSON.stringify([...localLikedIds]));
  
  updateLikeButtonUI(opportunityId, newLikesCount, true);
  updateMetrics();

  try {
    // Try via stored RPC function first, or direct update
    const { error: rpcError } = await supabaseClient.rpc('increment_likes', { opportunity_id: opportunityId });

    if (rpcError) {
      // Fallback: direct table update
      const { error: updateError } = await supabaseClient
        .from('opportunities')
        .update({ likes: newLikesCount })
        .eq('id', opportunityId);

      if (updateError) {
        console.error('Error updating likes in Supabase:', updateError);
        showToast('No se pudo actualizar el like en Supabase', 'error');
        // Revert on error
        await loadOpportunities();
        return;
      }
    }

    showToast('❤️ ¡Voto registrado en Supabase!', 'info');
  } catch (err) {
    console.error('Error liking opportunity:', err);
  }
}

// Make handleLike available globally for inline onclick
window.handleLike = handleLike;

/**
 * Setup Realtime Subscription so all browser sessions see updates immediately
 */
function setupRealtimeSubscription() {
  supabaseClient
    .channel('opportunities-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, (payload) => {
      console.log('Realtime change received from Supabase:', payload);
      
      if (payload.eventType === 'INSERT') {
        // Prevent duplicate if already in memory
        if (!allOpportunities.some(o => o.id === payload.new.id)) {
          allOpportunities.unshift(payload.new);
          populateDynamicFilters();
          renderFilteredOpportunities();
          updateMetrics();
          showToast(`✨ Nueva oportunidad pública: "${payload.new.name}"`, 'info');
        }
      } else if (payload.eventType === 'UPDATE') {
        const index = allOpportunities.findIndex(o => o.id === payload.new.id);
        if (index !== -1) {
          allOpportunities[index] = payload.new;
          renderFilteredOpportunities();
          updateMetrics();
        }
      } else if (payload.eventType === 'DELETE') {
        allOpportunities = allOpportunities.filter(o => o.id === payload.old.id);
        renderFilteredOpportunities();
        updateMetrics();
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        realtimeStatus.innerHTML = '<span class="status-dot"></span><span>En vivo con Supabase</span>';
      }
    });
}

/* ==========================================================================
   UI Rendering & Filters
   ========================================================================== */

function populateDynamicFilters() {
  const currentCountry = filterCountry.value;
  const currentCity = filterCity.value;

  // Extract unique sorted countries & cities
  const countries = [...new Set(allOpportunities.map(o => o.country).filter(Boolean))].sort();
  const cities = [...new Set(allOpportunities.map(o => o.city).filter(Boolean))].sort();

  // Populate Countries
  filterCountry.innerHTML = '<option value="">🌍 Todos los países</option>' + 
    countries.map(c => `<option value="${escapeHtml(c)}" ${c === currentCountry ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

  // Populate Cities
  filterCity.innerHTML = '<option value="">📍 Todas las ciudades</option>' + 
    cities.map(c => `<option value="${escapeHtml(c)}" ${c === currentCity ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

function getFilteredOpportunities() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const selectedCountry = filterCountry.value.toLowerCase();
  const selectedCity = filterCity.value.toLowerCase();
  const selectedCategory = filterCategory.value.toLowerCase();
  const sort = sortBy.value;

  let filtered = allOpportunities.filter(item => {
    // Search input match (name, city, country, problem, solution, category)
    if (searchTerm) {
      const matchSearch = 
        (item.name && item.name.toLowerCase().includes(searchTerm)) ||
        (item.city && item.city.toLowerCase().includes(searchTerm)) ||
        (item.country && item.country.toLowerCase().includes(searchTerm)) ||
        (item.problem && item.problem.toLowerCase().includes(searchTerm)) ||
        (item.ai_solution && item.ai_solution.toLowerCase().includes(searchTerm)) ||
        (item.category && item.category.toLowerCase().includes(searchTerm));

      if (!matchSearch) return false;
    }

    // Country match
    if (selectedCountry && item.country?.toLowerCase() !== selectedCountry) {
      return false;
    }

    // City match
    if (selectedCity && item.city?.toLowerCase() !== selectedCity) {
      return false;
    }

    // Category match
    if (selectedCategory && item.category?.toLowerCase() !== selectedCategory) {
      return false;
    }

    return true;
  });

  // Sorting
  if (sort === 'likes') {
    filtered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else if (sort === 'potential') {
    const weight = { 'Alto': 3, 'Medio': 2, 'Bajo': 1 };
    filtered.sort((a, b) => (weight[b.potential] || 0) - (weight[a.potential] || 0));
  } else {
    // Recent (default)
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  return filtered;
}

function renderFilteredOpportunities() {
  const filtered = getFilteredOpportunities();
  visibleCount.textContent = filtered.length;

  if (filtered.length === 0) {
    opportunitiesGrid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  opportunitiesGrid.innerHTML = filtered.map(item => {
    const isLiked = localLikedIds.has(item.id);
    const potentialClass = getPotentialClass(item.potential);
    const timeFormatted = formatDate(item.created_at);

    return `
      <article class="opportunity-card" data-id="${item.id}">
        <div class="card-top">
          <span class="category-tag">${escapeHtml(item.category || 'General')}</span>
          <span class="potential-badge ${potentialClass}">
            <span>${getPotentialIcon(item.potential)}</span>
            <span>Potencial ${escapeHtml(item.potential || 'Medio')}</span>
          </span>
        </div>

        <h3 class="card-title">${escapeHtml(item.name)}</h3>

        <div class="card-location">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span>${escapeHtml(item.city)}, ${escapeHtml(item.country)}</span>
        </div>

        <div class="card-content-block">
          <div class="block-header problem-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Problema Detectado</span>
          </div>
          <p class="block-text">${escapeHtml(item.problem)}</p>
        </div>

        <div class="card-content-block solution-box">
          <div class="block-header solution-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
            </svg>
            <span>Solución con IA</span>
          </div>
          <p class="block-text">${escapeHtml(item.ai_solution)}</p>
        </div>

        <div class="card-footer">
          <button 
            type="button" 
            class="btn-like ${isLiked ? 'liked' : ''}" 
            onclick="handleLike(${item.id})"
            id="like-btn-${item.id}"
            title="Dar like / apoyar esta oportunidad"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span class="like-count">${item.likes || 0}</span>
          </button>

          <span class="card-time">${timeFormatted}</span>
        </div>
      </article>
    `;
  }).join('');
}

function updateLikeButtonUI(id, newCount, liked) {
  const btn = document.getElementById(`like-btn-${id}`);
  if (!btn) return;

  if (liked) {
    btn.classList.add('liked');
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', 'currentColor');
  }

  const countSpan = btn.querySelector('.like-count');
  if (countSpan) countSpan.textContent = newCount;
}

function updateMetrics() {
  statTotalOpportunities.textContent = allOpportunities.length;
  
  const citiesSet = new Set(allOpportunities.map(o => o.city?.trim().toLowerCase()).filter(Boolean));
  statTotalCities.textContent = citiesSet.size;

  const countriesSet = new Set(allOpportunities.map(o => o.country?.trim().toLowerCase()).filter(Boolean));
  statTotalCountries.textContent = countriesSet.size;

  const totalLikes = allOpportunities.reduce((sum, item) => sum + (item.likes || 0), 0);
  statTotalLikes.textContent = totalLikes;
}

/* ==========================================================================
   Helper Utilities
   ========================================================================== */

function getPotentialClass(potential) {
  const p = (potential || '').toLowerCase();
  if (p.includes('alto')) return 'potential-alto';
  if (p.includes('bajo')) return 'potential-bajo';
  return 'potential-medio';
}

function getPotentialIcon(potential) {
  const p = (potential || '').toLowerCase();
  if (p.includes('alto')) return '🔥';
  if (p.includes('bajo')) return '🌱';
  return '⚡';
}

function formatDate(isoString) {
  if (!isoString) return 'Reciente';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return 'Reciente';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ==========================================================================
   Modal Handling
   ========================================================================== */

function openModal() {
  opportunityModal.classList.add('open');
  opportunityModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.getElementById('inputName').focus();
}

function closeModal() {
  opportunityModal.classList.remove('open');
  opportunityModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// Modal Event Listeners
btnOpenModal.addEventListener('click', openModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

opportunityModal.addEventListener('click', (e) => {
  if (e.target === opportunityModal) {
    closeModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && opportunityModal.classList.contains('open')) {
    closeModal();
  }
});

/* ==========================================================================
   Form Submission
   ========================================================================== */

opportunityForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('inputName').value.trim();
  const city = document.getElementById('inputCity').value.trim();
  const country = document.getElementById('inputCountry').value.trim();
  const category = document.getElementById('inputCategory').value;
  const potential = document.getElementById('inputPotential').value;
  const problem = document.getElementById('inputProblem').value.trim();
  const ai_solution = document.getElementById('inputAiSolution').value.trim();

  // Basic validation
  if (!name || !city || !country || !category || !potential || !problem || !ai_solution) {
    showToast('Por favor, rellena todos los campos obligatorios.', 'error');
    return;
  }

  await createOpportunity({
    name,
    city,
    country,
    category,
    potential,
    problem,
    ai_solution
  });
});

/* ==========================================================================
   Filter & Search Event Listeners
   ========================================================================== */

searchInput.addEventListener('input', () => {
  clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
  renderFilteredOpportunities();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.style.display = 'none';
  renderFilteredOpportunities();
  searchInput.focus();
});

filterCountry.addEventListener('change', renderFilteredOpportunities);
filterCity.addEventListener('change', renderFilteredOpportunities);
filterCategory.addEventListener('change', renderFilteredOpportunities);
sortBy.addEventListener('change', renderFilteredOpportunities);

function resetFilters() {
  searchInput.value = '';
  clearSearchBtn.style.display = 'none';
  filterCountry.value = '';
  filterCity.value = '';
  filterCategory.value = '';
  sortBy.value = 'recent';
  renderFilteredOpportunities();
}

btnResetFilters.addEventListener('click', resetFilters);
btnEmptyReset.addEventListener('click', resetFilters);

/* ==========================================================================
   Initialization
   ========================================================================== */

function initApp() {
  loadOpportunities();
  setupRealtimeSubscription();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
