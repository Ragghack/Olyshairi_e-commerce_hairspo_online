// ==================== ENHANCED ADMIN DASHBOARD ====================
// Dynamic API URL configuration
const API_BASE_URL = 
    "http://localhost:5001/api";
    //"https://olyshairi-e-commerce-hairspo-online-kgz2.onrender.com/api";

console.log("🌐 Using API Base URL:", API_BASE_URL);
const ENDPOINTS = {
  ADMIN_LOGIN: `${API_BASE_URL}/admin/auth/login`,
  ADMIN_REGISTER: `${API_BASE_URL}/admin/auth/register`,
  ADMIN_PROFILE: `${API_BASE_URL}/admin/auth/profile`,
  PRODUCTS: `${API_BASE_URL}/admin/products`,
  PUBLIC_PRODUCTS: `${API_BASE_URL}/products`,
  ORDERS: `${API_BASE_URL}/admin/orders`,
  BOOKINGS: `${API_BASE_URL}/bookings/all`,
  UPDATE_BOOKING_STATUS: `${API_BASE_URL}/bookings`,
  BOOKINGS_STATS: `${API_BASE_URL}/bookings/stats`,
  USERS: `${API_BASE_URL}/admin/users`,
  USER_DETAILS: `${API_BASE_URL}/admin/users`,
  USER_STATUS: `${API_BASE_URL}/admin/users`,
  ACTIVITIES: `${API_BASE_URL}/admin/activities/dashboard-stats`,
  RECENT_ACTIVITIES: `${API_BASE_URL}/admin/activities/recent-activities`,
  SALES_ANALYTICS: `${API_BASE_URL}/admin/activities/sales-analytics`,
  HEALTH: `${API_BASE_URL}/health`,
  ADMIN_HEALTH: `${API_BASE_URL}/admin/health`,
  DELETE_BOOKING: `${API_BASE_URL}/bookings`,
  DELETE_ORDER: `${API_BASE_URL}/admin/orders`,
  ORDER_DETAILS: `${API_BASE_URL}/admin/orders`,
  UPDATE_ORDER: `${API_BASE_URL}/admin/orders`,
  RESTORE_BOOKING: `${API_BASE_URL}/bookings`,
  BOOKING_TRASH: `${API_BASE_URL}/bookings/trash`,
  BULK_DELETE_BOOKINGS: `${API_BASE_URL}/bookings/bulk-delete`,
  BULK_DELETE_ORDERS: `${API_BASE_URL}/admin/orders/bulk-delete`,
  ORDER_TRASH: `${API_BASE_URL}/admin/orders/trash`,
  RESTORE_ORDER: `${API_BASE_URL}/admin/orders`,
  SALES_REPORT: `${API_BASE_URL}/admin/reports/sales`,
  EXPORT_CSV: `${API_BASE_URL}/admin/reports/export/csv`,
  EXPORT_PDF: `${API_BASE_URL}/admin/reports/export/pdf`,
  EXPORT_DETAILED_PDF: `${API_BASE_URL}/admin/reports/export/detailed-pdf`,
  SALES_TODAY: `${API_BASE_URL}/admin/orders/sales/today-filtered`,
};

// ==================== ENHANCED STATE MANAGEMENT ====================
const AppState = {
  currentUser: null,
  authToken: localStorage.getItem("adminToken"),
  isTokenVerified: false,
  products: [],
  orders: [],
  bookings: [],
  users: [],
  currentPage: 1,
  productsPerPage: 10,
  ordersPerPage: 10,
  bookingsPerPage: 10,
  dataCache: new Map(),
  apiRetryCount: new Map(),
  MAX_RETRIES: 3,
};

// ==================== ENHANCED UTILITY FUNCTIONS ====================

// Safe data sanitization
const SecurityUtils = {
  sanitizeInput: (input) => {
    if (typeof input !== "string") return input;
    const div = document.createElement("div");
    div.textContent = input;
    return div.innerHTML;
  },

  safeJSONParse: (jsonString) => {
    try {
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  },

  validateEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Safe value display function
  safeDisplayValue: (value, defaultValue = '0') => {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    if (typeof value === 'object') {
      // If it's an object, return default value to avoid [object Object]
      console.warn('Object detected in display value, returning default');
      return defaultValue;
    }
    
    // Convert to string for display
    return String(value);
  },

  // Safe number formatting
  formatCurrency: (value, currency = '€') => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return `${currency}0.00`;
    }
    return `${currency}${numValue.toFixed(2)}`;
  }
};

// Enhanced caching system
const CacheManager = {
  set: (key, data, ttl = 300000) => {
    // 5 minutes default
    AppState.dataCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  },

  get: (key) => {
    const cached = AppState.dataCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > cached.ttl) {
      AppState.dataCache.delete(key);
      return null;
    }

    return cached.data;
  },

  clear: (pattern = null) => {
    if (pattern) {
      for (const key of AppState.dataCache.keys()) {
        if (key.includes(pattern)) {
          AppState.dataCache.delete(key);
        }
      }
    } else {
      AppState.dataCache.clear();
    }
  },
};

// ==================== ENHANCED API CLIENT ====================
const ApiClient = {
  async request(url, options = {}) {
    const cacheKey = `api_${url}_${JSON.stringify(options)}`;
    const cached = CacheManager.get(cacheKey);

    // Return cached non-GET requests for better performance
    if (cached && (!options.method || options.method === "GET")) {
      console.log("📦 Returning cached data for:", url);
      return { ok: true, data: cached };
    }

    const defaultOptions = {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
      timeout: 30000,
    };

    const mergedOptions = { ...defaultOptions, ...options };

    // Add authorization if token exists
    if (
      AppState.authToken &&
      !url.includes("/auth/login") &&
      !url.includes("/auth/register")
    ) {
      mergedOptions.headers.Authorization = `Bearer ${AppState.authToken}`;
    }

    try {
      console.log("🌐 API Request:", {
        url,
        method: mergedOptions.method || "GET",
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      mergedOptions.signal = controller.signal;

      const response = await fetch(url, mergedOptions);
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => null);

      if (response.ok) {
        // Cache successful GET responses
        if (!options.method || options.method === "GET") {
          CacheManager.set(cacheKey, data);
        }
        return { ok: true, data, response };
      } else {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("❌ API Request Failed:", error.message);

      // Retry logic for network errors
      const retryCount = AppState.apiRetryCount.get(url) || 0;
      if (
        error.name === "AbortError" &&
        retryCount < AppState.MAX_RETRIES
      ) {
        console.log(
          `🔄 Retrying request (${retryCount + 1}/${AppState.MAX_RETRIES})...`
        );
        AppState.apiRetryCount.set(url, retryCount + 1);
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (retryCount + 1))
        );
        return this.request(url, options);
      }

      AppState.apiRetryCount.delete(url);
      return {
        ok: false,
        error: error.message,
        status: error.name === "AbortError" ? 408 : 500,
      };
    }
  },

  async authenticatedRequest(url, options = {}) {
    if (!AppState.authToken) {
      showNotification(
        "Authentication required. Please login again.",
        "error"
      );
      handleLogout();
      return { ok: false, error: "No authentication token" };
    }

    return this.request(url, options);
  },
};

// ==================== ENHANCED ERROR HANDLER ====================
const ErrorHandler = {
  handleApiError(error, context = "") {
    console.error(`❌ ${context} Error:`, error);

    const message = error.message || "An unexpected error occurred";
    let userMessage = message;
    let type = "error";

    if (error.status === 401) {
      userMessage = "Session expired. Please login again.";
      handleLogout();
    } else if (error.status === 403) {
      userMessage = "Access denied. Insufficient permissions.";
    } else if (error.status === 404) {
      userMessage = "Requested resource not found.";
      type = "warning";
    } else if (error.status === 408 || error.name === "AbortError") {
      userMessage = "Request timeout. Please check your connection.";
    } else if (error.status >= 500) {
      userMessage = "Server error. Please try again later.";
    }

    showNotification(userMessage, type);
    return { success: false, error: userMessage };
  },

  wrapAsync(fn, context = "") {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        return this.handleApiError(error, context);
      }
    };
  },
};

// ==================== ENHANCED INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", function () {
  initializeApp();
});

async function initializeApp() {
  console.log("🚀 Initializing Enhanced Admin Dashboard...");

  // Test API connectivity first
  const isApiReachable = await testApiConnectivity();

  if (!isApiReachable) {
    showNotification(
      "Cannot connect to server. Please ensure the backend is running.",
      "error"
    );
  }

  // Check if user is already logged in
  if (AppState.authToken) {
    await verifyTokenAndLoadDashboard();
  } else {
    showLogin();
  }

  setupEventListeners();
  setupPerformanceMonitoring();
}

// ==================== ENHANCED AUTHENTICATION ====================
async function testApiConnectivity() {
  try {
    console.log("🧪 Testing API connectivity...");
    const result = await ApiClient.request(ENDPOINTS.HEALTH);
    return result.ok;
  } catch (error) {
    console.error("❌ API server is not reachable:", error);
    return false;
  }
}

async function verifyTokenAndLoadDashboard() {
  if (!AppState.authToken) {
    console.log("❌ No token found in localStorage");
    showLogin();
    return;
  }

  try {
    console.log("🔐 Verifying admin token...");
    const result = await ApiClient.authenticatedRequest(
      ENDPOINTS.ADMIN_PROFILE
    );

    if (result.ok) {
      AppState.currentUser = result.data.user;
      AppState.isTokenVerified = true;
      console.log("✅ Token verified successfully");
      showDashboard();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.log("❌ Token verification failed:", error);
    localStorage.removeItem("adminToken");
    AppState.authToken = null;
    showNotification("Session expired. Please login again.", "error");
    showLogin();
  }
}

// ==================== ENHANCED UI MANAGEMENT ====================
function showLogin() {
  document.getElementById("loginContainer").style.display = "flex";
  document.getElementById("registerContainer").style.display = "none";
  document.getElementById("dashboard").style.display = "none";
}

function showRegister() {
  document.getElementById("loginContainer").style.display = "none";
  document.getElementById("registerContainer").style.display = "flex";
  document.getElementById("dashboard").style.display = "none";
}

function showDashboard() {
  document.getElementById("loginContainer").style.display = "none";
  document.getElementById("registerContainer").style.display = "none";
  document.getElementById("dashboard").style.display = "block";

  // Update admin info
  if (AppState.currentUser) {
    const name = SecurityUtils.sanitizeInput(
      `${AppState.currentUser.firstName} ${AppState.currentUser.lastName}`
    );
    document.getElementById("adminName").textContent = name;
    document.getElementById("adminGreeting").textContent =
      SecurityUtils.sanitizeInput(AppState.currentUser.firstName);
    document.getElementById(
      "welcomeMessage"
    ).textContent = `Welcome, ${SecurityUtils.sanitizeInput(
      AppState.currentUser.firstName
    )}`;
  }

  loadDashboardData();
}

// ==================== ENHANCED SECTION MANAGEMENT ====================
function switchSection(sectionId) {
  // Hide all sections with animation
  document.querySelectorAll(".content-section").forEach((section) => {
    section.classList.remove("active");
  });

  // Show the selected section
  const targetSection = document.getElementById(sectionId);
  targetSection.classList.add("active");

  // Update sidebar active state
  document.querySelectorAll(".sidebar-bubble").forEach((bubble) => {
    bubble.classList.remove("active");
    if (bubble.getAttribute("data-section") === sectionId) {
      bubble.classList.add("active");
    }
  });

  // Load section-specific data with debouncing
  clearTimeout(window.sectionLoadTimeout);
  window.sectionLoadTimeout = setTimeout(() => {
    loadSectionData(sectionId);
  }, 50);
}

async function loadSectionData(sectionId) {
  switch (sectionId) {
    case "reports":
      await loadReports();
      break;
    case "products":
      await loadProducts();
      break;
    case "orders":
      await loadOrders();
      break;
    case "bookings":
      await loadBookings();
      break;
    case "users":
      await loadUsers();
      break;
    default:
      // No data loading needed for other sections
      break;
  }
}

// ==================== ENHANCED DATA LOADING ====================
async function loadDashboardData() {
  try {
    const [statsResult, bookingsResult, todaySalesResult] = await Promise.allSettled([
      ApiClient.authenticatedRequest(ENDPOINTS.ACTIVITIES),
      ApiClient.authenticatedRequest(ENDPOINTS.BOOKINGS),
      ApiClient.authenticatedRequest(ENDPOINTS.SALES_TODAY) // Use the new endpoint
    ]);

    // Initialize dashboard stats
    let dashboardStats = {
      totalSalesToday: 0,
      newOrdersCount: 0,
      pendingBookings: 0,
      bookingRevenue: 0
    };

    // Update from activities
    if (statsResult.status === "fulfilled" && statsResult.value.ok) {
      const activitiesData = statsResult.value.data;
      dashboardStats = {
        ...dashboardStats,
        ...activitiesData
      };
    }

    // Update from today's sales
    if (todaySalesResult.status === "fulfilled" && todaySalesResult.value.ok) {
      const todaySales = todaySalesResult.value.data;
      // Ensure we have a numeric value
      dashboardStats.totalSalesToday = todaySales.totalSales || 0;
    }

    // Update dashboard display
    updateDashboardStats(dashboardStats);

    // Update recent bookings
    if (bookingsResult.status === "fulfilled" && bookingsResult.value.ok) {
      updateRecentBookings(bookingsResult.value.data.bookings?.slice(0, 5) || []);
    } else {
      updateRecentBookings([]);
    }

  } catch (error) {
    ErrorHandler.handleApiError(error, "Dashboard data loading");
  }
}

function updateDashboardStats(stats) {
  // Handle different possible structures of stats object
  let totalSalesToday = 0;
  let newOrdersCount = 0;
  let pendingBookings = 0;
  let bookingRevenue = 0;
  
  // Debug: Log what we're receiving
  console.log('Raw stats object received:', stats);
  
  // Check if stats is valid
  if (!stats || typeof stats !== 'object') {
    console.warn('Invalid stats object received');
    // Set default values to 0
  } else {
    // Extract values safely - check each property
    
    // Handle totalSalesToday (most likely the culprit)
    if (stats.totalSalesToday !== undefined) {
      if (typeof stats.totalSalesToday === 'number') {
        totalSalesToday = stats.totalSalesToday;
      } else if (typeof stats.totalSalesToday === 'object') {
        // If it's an object, try to extract a numeric value
        const salesObj = stats.totalSalesToday;
        for (let key in salesObj) {
          if (typeof salesObj[key] === 'number') {
            totalSalesToday = salesObj[key];
            break;
          }
        }
      } else if (typeof stats.totalSalesToday === 'string') {
        // If it's a string, try to convert to number
        totalSalesToday = parseFloat(stats.totalSalesToday) || 0;
      }
    }
    
    // Handle newOrdersCount
    if (typeof stats.newOrdersCount === 'number') {
      newOrdersCount = stats.newOrdersCount;
    } else if (typeof stats.orders?.newOrdersCount === 'number') {
      newOrdersCount = stats.orders.newOrdersCount;
    }
    
    // Handle pendingBookings
    if (typeof stats.pendingBookings === 'number') {
      pendingBookings = stats.pendingBookings;
    } else if (typeof stats.bookings?.pending === 'number') {
      pendingBookings = stats.bookings.pending;
    }
    
    // Handle bookingRevenue
    if (typeof stats.bookingRevenue === 'number') {
      bookingRevenue = stats.bookingRevenue;
    } else if (typeof stats.bookings?.revenue === 'number') {
      bookingRevenue = stats.bookings.revenue;
    }
  }
  
  // Update the DOM elements with proper formatting
  const totalSalesElement = document.getElementById("totalSales");
  if (totalSalesElement) {
    totalSalesElement.textContent = `€${totalSalesToday.toFixed(2)}`;
  }
  
  const newOrdersElement = document.getElementById("newOrders");
  if (newOrdersElement) {
    newOrdersElement.textContent = newOrdersCount;
  }
  
  const pendingBookingsElement = document.getElementById("pendingBookings");
  if (pendingBookingsElement) {
    pendingBookingsElement.textContent = pendingBookings;
  }
  
  const bookingRevenueElement = document.getElementById("bookingRevenue");
  if (bookingRevenueElement) {
    bookingRevenueElement.textContent = `€${bookingRevenue.toFixed(2)}`;
  }
  
  // Log for debugging
  console.log('Dashboard stats updated:', {
    totalSalesToday,
    newOrdersCount,
    pendingBookings,
    bookingRevenue
  });
}

function updateRecentBookings(bookings) {
  const container = document.getElementById("recentBookings");
  if (!container) {
    console.warn("❌ Recent bookings container not found");
    return;
  }

  container.innerHTML = "";

  if (!bookings || bookings.length === 0) {
    container.innerHTML =
      '<tr><td colspan="6" style="text-align: center;">No recent bookings</td></tr>';
    return;
  }

  bookings.forEach((booking) => {
    const row = document.createElement("tr");
    const customerName = booking.customerName || 
                         (booking.userId ? `${booking.userId.firstName} ${booking.userId.lastName}` : 'Unknown');
    const statusClass = `status-${booking.status.replace('_', '-')}`;
    const createdDate = new Date(booking.createdAt).toLocaleDateString();

    row.innerHTML = `
          <td>${SecurityUtils.sanitizeInput(customerName)}</td>
          <td>${booking.service || 'Wig Renovation'}</td>
          <td>${booking.wigCount}</td>
          <td><span class="status-badge ${statusClass}">${booking.status}</span></td>
          <td>${createdDate}</td>
          <td>
              <button class="action-btn view-booking" data-id="${booking._id}">View</button>
          </td>
      `;

    container.appendChild(row);
  });

  // Add event listeners
  document.querySelectorAll('.view-booking').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const bookingId = e.target.dataset.id;
      viewBookingDetails(bookingId);
    });
  });

  console.log(`✅ Updated ${bookings.length} recent bookings`);
}

// ==================== ENHANCED BOOKINGS MANAGEMENT ====================
async function loadBookings(forceRefresh = false) {
  try {
    console.log('🔄 Loading bookings...');
    
    if (forceRefresh) {
      CacheManager.clear("bookings");
    }
    
    const [bookingsResult, statsResult] = await Promise.all([
      ApiClient.authenticatedRequest(ENDPOINTS.BOOKINGS),
      ApiClient.authenticatedRequest(ENDPOINTS.BOOKINGS_STATS)
    ]);

    if (bookingsResult.ok) {
      AppState.bookings = bookingsResult.data.bookings || [];
      renderBookings(AppState.bookings);
    } else {
      // Fallback to mock data
      const mockBookings = getMockBookings();
      AppState.bookings = mockBookings;
      renderBookings(mockBookings);
      showNotification('Using demo bookings data', 'warning');
    }

    if (statsResult.ok) {
      updateBookingStats(statsResult.data.stats);
    } else {
      updateBookingStatsFromBookings(AppState.bookings);
    }
  } catch (error) {
    ErrorHandler.handleApiError(error, 'Bookings loading');
  }
}

function renderBookings(bookings) {
  const tableBody = document.getElementById('bookingsTableBody');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  if (!bookings || bookings.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px;">
          No bookings found
        </td>
      </tr>
    `;
    return;
  }

  bookings.forEach((booking) => {
    const row = document.createElement('tr');
    row.className = 'booking-row';
    row.setAttribute('data-booking-id', booking._id);
    
    const customerName = booking.customerName || 
                       (booking.userId ? `${booking.userId.firstName} ${booking.userId.lastName}` : 'Unknown');
    const customerEmail = booking.customerEmail || 
                        (booking.userId ? booking.userId.email : 'N/A');
    const statusClass = `status-${booking.status.replace('_', '-')}`;
    const createdDate = new Date(booking.createdAt).toLocaleDateString();
    
    // Add delete button only for cancelled bookings
    const deleteButton = booking.status === 'cancelled' ? 
      `<button class="action-btn btn-danger delete-booking" data-id="${booking._id}">
        <i class="fas fa-trash"></i> Delete
      </button>` : 
      '';

    row.innerHTML = `
      <td>#${booking._id.substring(0, 8)}...</td>
      <td>
        <div><strong>${SecurityUtils.sanitizeInput(customerName)}</strong></div>
        <small>${SecurityUtils.sanitizeInput(customerEmail)}</small>
      </td>
      <td>${booking.service || 'Wig Renovation'}</td>
      <td>${booking.wigCount}</td>
      <td>€${booking.totalPrice || (booking.wigCount * 15)}</td>
      <td><span class="status-badge ${statusClass}">${booking.status}</span></td>
      <td>${createdDate}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn view-booking" data-id="${booking._id}">
            <i class="fas fa-eye"></i> View
          </button>
          <button class="action-btn btn-warning update-booking-status" data-id="${booking._id}">
            <i class="fas fa-edit"></i> Update
          </button>
          ${deleteButton}
        </div>
      </td>
    `;

    tableBody.appendChild(row);
  });

  // Use event delegation for better performance
  tableBody.addEventListener('click', function(e) {
    const target = e.target;
    
    // Handle view booking
    if (target.classList.contains('view-booking') || target.closest('.view-booking')) {
      const btn = target.classList.contains('view-booking') ? target : target.closest('.view-booking');
      const bookingId = btn.dataset.id;
      viewBookingDetails(bookingId);
    }
    
    // Handle update booking status
    else if (target.classList.contains('update-booking-status') || target.closest('.update-booking-status')) {
      const btn = target.classList.contains('update-booking-status') ? target : target.closest('.update-booking-status');
      const bookingId = btn.dataset.id;
      updateBookingStatus(bookingId);
    }
    
    // Handle delete booking
    else if (target.classList.contains('delete-booking') || target.closest('.delete-booking')) {
      const btn = target.classList.contains('delete-booking') ? target : target.closest('.delete-booking');
      const bookingId = btn.dataset.id;
      deleteBooking(bookingId);
    }
  });

  console.log(`✅ Rendered ${bookings.length} bookings with event delegation`);
}

// ==================== ENHANCED BOOKING DELETION FUNCTION ====================
async function deleteBooking(bookingId) {
  console.log('🗑️ Attempting to delete booking:', bookingId);
  
  if (!confirm("Are you sure you want to delete this booking? This action cannot be undone.")) {
    return;
  }

  try {
    // Find the booking to get its details
    const booking = AppState.bookings.find(b => b._id === bookingId);
    if (!booking) {
      showNotification('Booking not found', 'error');
      return;
    }

    // Double-check that it's a cancelled booking
    if (booking.status !== 'cancelled') {
      showNotification('Only cancelled bookings can be deleted.', 'error');
      return;
    }

    // Show loading state
    const deleteBtn = document.querySelector(`.delete-booking[data-id="${bookingId}"]`);
    if (deleteBtn) {
      const originalHTML = deleteBtn.innerHTML;
      deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
      deleteBtn.disabled = true;
    }

    const result = await ApiClient.authenticatedRequest(
      `${ENDPOINTS.DELETE_BOOKING}/${bookingId}`,
      {
        method: "DELETE",
        //headers: {
        //  'Cache-Control': 'no-cache, no-store, must-revalidate',
         // 'Pragma': 'no-cache',
         // 'Expires': '0'
       // }
      }
    );

    if (result.ok) {
      console.log('✅ Booking deletion API call successful');
      
      // 1. Remove from AppState immediately
      AppState.bookings = AppState.bookings.filter(b => b._id !== bookingId);
      console.log('Remaining bookings in state:', AppState.bookings.length);
      
      // 2. Clear all relevant caches
      CacheManager.clear("bookings");
      CacheManager.clear("activities");
      CacheManager.clear("dashboard");
      
      // 3. Remove from UI immediately with animation
      removeBookingFromUI(bookingId);
      
      // 4. Update stats
      updateBookingStatsFromBookings(AppState.bookings);
      
      // 5. Update dashboard stats if we're on dashboard
      loadDashboardData();
      
      showNotification("Booking deleted successfully!", "success");
      
      // 6. Force a full refresh after 1 second to ensure sync with server
      setTimeout(() => {
        loadBookings(true);
      }, 1000);
      
    } else {
      throw new Error(result.error || "Failed to delete booking");
    }
  } catch (error) {
    console.error("❌ Delete booking error:", error);
    showNotification("Failed to delete booking: " + error.message, "error");
    
    // Reset button if it exists
    const deleteBtn = document.querySelector(`.delete-booking[data-id="${bookingId}"]`);
    if (deleteBtn) {
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
      deleteBtn.disabled = false;
    }
  }
}

// Helper function to remove booking from UI with animation
function removeBookingFromUI(bookingId) {
  const tableBody = document.getElementById('bookingsTableBody');
  if (!tableBody) return false;
  
  const row = tableBody.querySelector(`tr[data-booking-id="${bookingId}"]`);
  if (!row) {
    // Try to find by ID in first cell
    const rows = tableBody.querySelectorAll('tr.booking-row, tr:not([style*="display: none"])');
    let foundRow = null;
    
    rows.forEach(r => {
      const firstCell = r.querySelector('td:first-child');
      if (firstCell && firstCell.textContent.includes(bookingId.substring(0, 8))) {
        foundRow = r;
      }
    });
    
    if (!foundRow) {
      console.log('Row not found in UI, booking might already be removed');
      return false;
    }
    
    // Animate removal
    foundRow.style.transition = 'all 0.3s ease';
    foundRow.style.opacity = '0';
    foundRow.style.transform = 'translateX(-20px)';
    foundRow.style.height = foundRow.offsetHeight + 'px';
    
    setTimeout(() => {
      foundRow.style.height = '0';
      foundRow.style.margin = '0';
      foundRow.style.padding = '0';
      foundRow.style.border = 'none';
      foundRow.style.overflow = 'hidden';
    }, 50);
    
    setTimeout(() => {
      if (foundRow.parentNode === tableBody) {
        tableBody.removeChild(foundRow);
      }
      
      // Check if table is now empty
      const remainingRows = tableBody.querySelectorAll('tr:not([style*="display: none"])');
      if (remainingRows.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 40px;">
              No bookings found
            </td>
          </tr>
        `;
      }
    }, 350);
    
    return true;
  }
  
  // Animate removal for row found by data attribute
  row.style.transition = 'all 0.3s ease';
  row.style.opacity = '0';
  row.style.transform = 'translateX(-20px)';
  row.style.height = row.offsetHeight + 'px';
  
  setTimeout(() => {
    row.style.height = '0';
    row.style.margin = '0';
    row.style.padding = '0';
    row.style.border = 'none';
    row.style.overflow = 'hidden';
  }, 50);
  
  setTimeout(() => {
    if (row.parentNode === tableBody) {
      tableBody.removeChild(row);
    }
    
    // Check if table is now empty
    const remainingRows = tableBody.querySelectorAll('tr:not([style*="display: none"])');
    if (remainingRows.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 40px;">
            No bookings found
          </td>
        </tr>
      `;
    }
  }, 350);
  
  return true;
}

// Update booking stats from current bookings
function updateBookingStatsFromBookings(bookings) {
  if (!bookings || !Array.isArray(bookings)) {
    bookings = AppState.bookings || [];
  }
  
  const totalBookings = bookings.length;
  const pendingBookings = bookings.filter(b => b.status === 'pending').length;
  const inProgressBookings = bookings.filter(b => b.status === 'in_progress').length;
  const completedBookings = bookings.filter(b => b.status === 'completed').length;
  const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;

  // Update UI elements
  const totalElement = document.getElementById('totalBookings');
  const pendingElement = document.getElementById('pendingBookingsCount');
  const inProgressElement = document.getElementById('inProgressBookings');
  const completedElement = document.getElementById('completedBookings');
  
  if (totalElement) totalElement.textContent = totalBookings;
  if (pendingElement) pendingElement.textContent = pendingBookings;
  if (inProgressElement) inProgressElement.textContent = inProgressBookings;
  if (completedElement) completedElement.textContent = completedBookings;
  
  console.log('📊 Updated booking stats:', {
    totalBookings,
    pendingBookings,
    inProgressBookings,
    completedBookings,
    cancelledBookings
  });
}

function updateBookingStats(stats) {
  document.getElementById('totalBookings').textContent = stats.totalBookings || 0;
  document.getElementById('pendingBookingsCount').textContent = stats.pendingBookings || 0;
  document.getElementById('inProgressBookings').textContent = stats.inProgressBookings || 0;
  document.getElementById('completedBookings').textContent = stats.completedBookings || 0;
}

function getMockBookings(limit = null) {
  const mockBookings = [
    {
      _id: 'booking_1',
      customerName: 'Sarah Johnson',
      customerEmail: 'sarah@example.com',
      service: 'Wig Renovation',
      wigCount: 2,
      totalPrice: 30,
      status: 'pending',
      createdAt: new Date(),
      estimatedCompletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notes: 'Please handle with care, sentimental value'
    },
    {
      _id: 'booking_2',
      customerName: 'Maria Rodriguez',
      customerEmail: 'maria@example.com',
      service: 'Wig Renovation',
      wigCount: 1,
      totalPrice: 15,
      status: 'confirmed',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      estimatedCompletion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    },
    {
      _id: 'booking_3',
      customerName: 'David Smith',
      customerEmail: 'david@example.com',
      service: 'Wig Renovation',
      wigCount: 3,
      totalPrice: 45,
      status: 'in_progress',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      estimatedCompletion: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      notes: 'Urgent - needed for event'
    },
    {
      _id: 'booking_4',
      customerName: 'Lisa Chen',
      customerEmail: 'lisa@example.com',
      service: 'Wig Renovation',
      wigCount: 1,
      totalPrice: 15,
      status: 'completed',
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      estimatedCompletion: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    }
  ];
  
  return limit ? mockBookings.slice(0, limit) : mockBookings;
}

async function viewBookingDetails(bookingId) {
  try {
    const booking = AppState.bookings.find(b => b._id === bookingId);
    if (!booking) {
      showNotification('Booking not found', 'error');
      return;
    }

    const customerName = booking.customerName || 
                       (booking.userId ? `${booking.userId.firstName} ${booking.userId.lastName}` : 'Unknown');
    
    const modalHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3>Booking Details</h3>
            <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;">×</button>
          </div>
          
          <div class="booking-details">
            <div class="detail-section">
              <h4>Customer Information</h4>
              <p><strong>Name:</strong> ${customerName}</p>
              <p><strong>Email:</strong> ${booking.customerEmail || (booking.userId?.email || 'N/A')}</p>
              <p><strong>Phone:</strong> ${booking.customerPhone || 'N/A'}</p>
            </div>
            
            <div class="detail-section">
              <h4>Service Details</h4>
              <p><strong>Service:</strong> ${booking.service || 'Wig Renovation'}</p>
              <p><strong>Number of Wigs:</strong> ${booking.wigCount}</p>
              <p><strong>Total Price:</strong> €${booking.totalPrice || (booking.wigCount * 15)}</p>
              <p><strong>Status:</strong> <span class="status-badge status-${booking.status.replace('_', '-')}">${booking.status}</span></p>
            </div>
            
            ${booking.notes ? `
            <div class="detail-section">
              <h4>Customer Notes</h4>
              <p>${booking.notes}</p>
            </div>
            ` : ''}
            
            <div class="detail-section">
              <h4>Timeline</h4>
              <p><strong>Created:</strong> ${new Date(booking.createdAt).toLocaleString()}</p>
              ${booking.estimatedCompletion ? `
              <p><strong>Estimated Completion:</strong> ${new Date(booking.estimatedCompletion).toLocaleString()}</p>
              ` : ''}
            </div>
          </div>
          
          ${booking.status === 'cancelled' ? `
          <div style="margin-top:20px;display:flex;gap:10px;">
            <button class="action-btn btn-danger" onclick="deleteBooking('${bookingId}'); closeModal();">Delete Booking</button>
            <button class="action-btn" onclick="closeModal()">Close</button>
          </div>
          ` : `
          <div style="margin-top:20px;display:flex;gap:10px;">
            <button class="action-btn" onclick="closeModal()">Close</button>
          </div>
          `}
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  } catch (error) {
    console.error('View booking error:', error);
    showNotification('Failed to load booking details', 'error');
  }
}

async function updateBookingStatus(bookingId) {
  try {
    const booking = AppState.bookings.find(b => b._id === bookingId);
    if (!booking) {
      showNotification('Booking not found', 'error');
      return;
    }

    const statusOptions = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    const currentStatusIndex = statusOptions.indexOf(booking.status);
    
    let statusOptionsHTML = '';
    statusOptions.forEach((status, index) => {
      const isCurrent = status === booking.status;
      const statusLabel = status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      statusOptionsHTML += `<option value="${status}" ${isCurrent ? 'selected' : ''}>${statusLabel}</option>`;
    });

    const modalHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3>Update Booking Status</h3>
            <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;">×</button>
          </div>
          
          <form id="updateStatusForm">
            <div class="form-group">
              <label for="newStatus">Status</label>
              <select id="newStatus" class="form-control" required>
                ${statusOptionsHTML}
              </select>
            </div>
            
            <div id="completionDateField" style="display: none;">
              <div class="form-group">
                <label for="estimatedCompletion">Estimated Completion Date</label>
                <input type="date" id="estimatedCompletion" class="form-control">
              </div>
            </div>
            
            <div id="cancellationReasonField" style="display: none;">
              <div class="form-group">
                <label for="cancellationReason">Cancellation Reason (Optional)</label>
                <textarea id="cancellationReason" class="form-control" rows="3" placeholder="Enter reason for cancellation..."></textarea>
              </div>
            </div>
            
            <div style="margin-top:20px;display:flex;gap:10px;">
              <button type="submit" class="action-btn">Update Status</button>
              <button type="button" class="action-btn btn-danger" onclick="closeModal()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Show/hide fields based on selected status
    const statusSelect = document.getElementById('newStatus');
    const completionDateField = document.getElementById('completionDateField');
    const cancellationReasonField = document.getElementById('cancellationReasonField');
    
    statusSelect.addEventListener('change', function() {
      const selectedStatus = this.value;
      completionDateField.style.display = selectedStatus === 'confirmed' ? 'block' : 'none';
      cancellationReasonField.style.display = selectedStatus === 'cancelled' ? 'block' : 'none';
    });
    
    // Trigger change to set initial visibility
    statusSelect.dispatchEvent(new Event('change'));
    
    // Form submission
    document.getElementById('updateStatusForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const newStatus = statusSelect.value;
      const estimatedCompletion = document.getElementById('estimatedCompletion').value;
      const cancellationReason = document.getElementById('cancellationReason').value;
      
      const updateData = {
        status: newStatus
      };
      
      if (newStatus === 'confirmed' && estimatedCompletion) {
        updateData.estimatedCompletion = new Date(estimatedCompletion);
      }
      
      if (newStatus === 'cancelled' && cancellationReason) {
        updateData.cancellationReason = cancellationReason;
      }
      
      try {
        const result = await ApiClient.authenticatedRequest(
          `${ENDPOINTS.UPDATE_BOOKING_STATUS}/${bookingId}/status`,
          {
            method: 'PUT',
            body: JSON.stringify(updateData)
          }
        );

        if (result.ok) {
          showNotification('Booking status updated successfully', 'success');
          closeModal();
          loadBookings(); // Refresh the list
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('Update booking status error:', error);
        showNotification('Failed to update booking status', 'error');
      }
    });
    
  } catch (error) {
    console.error('Update booking status error:', error);
    showNotification('Failed to load booking update form', 'error');
  }
}

function closeModal() {
  const modal = document.querySelector('.modal-overlay');
  if (modal) modal.remove();
}

// ==================== ENHANCED ORDERS MANAGEMENT ====================
async function loadOrders() {
  console.log("🔄 Loading orders...");

  const result = await ApiClient.authenticatedRequest(ENDPOINTS.ORDERS);

  if (result.ok) {
    AppState.orders = result.data.orders || [];
    renderOrders(AppState.orders);
    updateOrderStats(AppState.orders);
    showNotification(
      `Loaded ${AppState.orders.length} orders`,
      "success"
    );
  } else {
    // Fallback to mock data
    console.log("🔄 Using mock orders data");
    const mockOrders = getMockOrders();
    renderOrders(mockOrders);
    updateOrderStats(mockOrders);
    showNotification("Using demo orders data", "warning");
  }
}

function renderOrders(ordersToRender) {
  const tableBody = document.getElementById("ordersTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (!ordersToRender || ordersToRender.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="7" style="text-align: center;">No orders found</td></tr>';
    return;
  }

  ordersToRender.forEach((order) => {
    const row = document.createElement("tr");
    const statusClass = `status-${order.status?.toLowerCase() || "pending"}`;
    const orderDate = order.orderDate
      ? new Date(order.orderDate).toLocaleDateString()
      : "N/A";
    
    // Check if there's a pending cancellation request
    const cancellationRequests = JSON.parse(localStorage.getItem('cancellationRequests')) || [];
    const hasCancellationRequest = cancellationRequests.some(req => req.orderId === order._id);
    
    // Add cancellation request badge
    const cancellationBadge = hasCancellationRequest ? 
        `<span class="status-badge status-warning" style="margin-left:5px;">Cancellation Requested</span>` : '';

    row.innerHTML = `
          <td>#${SecurityUtils.sanitizeInput(
            order.orderNumber || "N/A"
          )}</td>
          <td>${SecurityUtils.sanitizeInput(
            order.customerName || "Unknown"
          )}</td>
          <td><span class="status-badge ${statusClass}">${SecurityUtils.sanitizeInput(
      order.status || "pending"
    )}</span>${cancellationBadge}</td>
          <td>€${(order.totalAmount || 0).toFixed(2)}</td>
          <td>${orderDate}</td>
          <td>${order.itemCount || 0}</td>
          <td>
              <button class="action-btn view-order" data-id="${
                order._id || order.id
              }">View</button>
              <button class="action-btn btn-warning update-status" data-id="${
                order._id || order.id
              }">Update</button>
          </td>
      `;

    tableBody.appendChild(row);
  });

  document.querySelectorAll(".view-order").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const orderId = e.target.dataset.id;
      viewOrder(orderId);
    });
  });

  document.querySelectorAll(".update-status").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const orderId = e.target.dataset.id;
      updateOrderStatus(orderId);
    });
  });
}

function updateOrderStats(orders) {
  const totalOrders = orders.length;
  const pendingOrders = orders.filter(
    (order) => order.status === "pending"
  ).length;
  const processingOrders = orders.filter(
    (order) => order.status === "processing"
  ).length;
  const completedOrders = orders.filter(
    (order) => order.status === "delivered"
  ).length;

  document.getElementById("totalOrders").textContent = totalOrders;
  document.getElementById("pendingOrders").textContent = pendingOrders;
  document.getElementById("processingOrders").textContent =
    processingOrders;
  document.getElementById("completedOrders").textContent =
    completedOrders;
}

function getMockOrders() {
  return [
    {
      orderNumber: "OL-" + Date.now(),
      customerName: "Demo Customer",
      status: "processing",
      totalAmount: 89.99,
      orderDate: new Date(),
      itemCount: 2,
      paymentStatus: "paid",
    },
    {
      orderNumber: "OL-" + (Date.now() - 1000000),
      customerName: "Test User",
      status: "delivered",
      totalAmount: 149.99,
      orderDate: new Date(Date.now() - 86400000),
      itemCount: 3,
      paymentStatus: "paid",
    },
  ];
}

function viewOrder(orderId) {
  showNotification("View order functionality coming soon", "info");
}

function updateOrderStatus(orderId) {
  showNotification(
    "Update order status functionality coming soon",
    "info"
  );
}

function refreshOrders() {
  CacheManager.clear("orders");
  loadOrders();
}

// ==================== ENHANCED PRODUCTS MANAGEMENT ====================
async function loadProducts(page = 1) {
  try {
    console.log("🔄 Loading products...");
    AppState.currentPage = page;

    const result = await ApiClient.authenticatedRequest(
      `${ENDPOINTS.PRODUCTS}?page=${page}&limit=${AppState.productsPerPage}`
    );

    if (result.ok) {
      AppState.products = result.data.products || result.data;
      renderProducts(AppState.products);
      if (result.data.pagination) {
        renderPagination(result.data.pagination, "products");
      }
    } else {
      // Fallback to public endpoint
      const publicResult = await ApiClient.request(
        ENDPOINTS.PUBLIC_PRODUCTS
      );
      if (publicResult.ok) {
        AppState.products = publicResult.data;
        renderProducts(AppState.products);
        showNotification("Using public products data", "warning");
      } else {
        throw new Error("Failed to load products");
      }
    }
  } catch (error) {
    ErrorHandler.handleApiError(error, "Products loading");
  }
}

function renderProducts(productsToRender) {
  const tableBody = document.getElementById("productsTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (!productsToRender || productsToRender.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="6" style="text-align: center;">No products found</td></tr>';
    return;
  }

  productsToRender.forEach((product) => {
    const row = document.createElement("tr");
    const statusClass =
      product.stock < 10 ? "status-low" : "status-delivered";
    const statusText = product.stock < 10 ? "Low Stock" : "In Stock";

    row.innerHTML = `
          <td>${SecurityUtils.sanitizeInput(product.name)}</td>
          <td>${SecurityUtils.sanitizeInput(product.category)}</td>
          <td>€${product.price?.toFixed(2) || "0.00"}</td>
          <td>${product.stock}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>
              <button class="action-btn btn-warning edit-product" data-id="${
                product._id || product.id
              }">Edit</button>
              <button class="action-btn btn-danger delete-product" data-id="${
                product._id || product.id
              }">Delete</button>
          </td>
      `;

    tableBody.appendChild(row);
  });

  // Add event listeners to action buttons
  document.querySelectorAll(".edit-product").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const productId = e.target.dataset.id;
      editProduct(productId);
    });
  });

  document.querySelectorAll(".delete-product").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const productId = e.target.dataset.id;
      deleteProduct(productId);
    });
  });
}

// ==================== ENHANCED PRODUCT EDITING ====================
async function editProduct(productId) {
  try {
    // Find product in current state or fetch from API
    let product = AppState.products.find(p => p._id === productId);
    
    if (!product) {
      // Try to fetch product details from API
      const result = await ApiClient.authenticatedRequest(`${ENDPOINTS.PRODUCTS}/${productId}`);
      if (result.ok) {
        product = result.data;
      } else {
        showNotification('Product not found', 'error');
        return;
      }
    }

    // Create edit modal
    const modalHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3>Edit Product</h3>
            <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;">×</button>
          </div>
          
          <form id="editProductForm">
            <input type="hidden" id="editProductId" value="${productId}">
            
            <div class="form-group">
              <label for="editProductName">Product Name</label>
              <input
                type="text"
                id="editProductName"
                class="form-control"
                value="${SecurityUtils.sanitizeInput(product.name)}"
                required
              />
            </div>
            
            <div class="form-group">
              <label for="editProductDescription">Description</label>
              <textarea
                id="editProductDescription"
                class="form-control"
                rows="3"
                required
              >${SecurityUtils.sanitizeInput(product.description || '')}</textarea>
            </div>
            
            <div class="form-group">
              <label for="editProductPrice">Price (€)</label>
              <input
                type="number"
                id="editProductPrice"
                class="form-control"
                step="0.01"
                value="${product.price || 0}"
                required
              />
            </div>
            
            <div class="form-group">
              <label for="editProductOldPrice">Old Price (Optional)</label>
              <input
                type="number"
                id="editProductOldPrice"
                class="form-control"
                step="0.01"
                value="${product.oldPrice || ''}"
              />
            </div>
            
            <div class="form-group">
              <label for="editProductStock">Stock Quantity</label>
              <input
                type="number"
                id="editProductStock"
                class="form-control"
                value="${product.stock || 0}"
                required
              />
            </div>
            
            <div class="form-group">
              <label for="editProductCategory">Category</label>
              <select id="editProductCategory" class="form-control" required>
                <option value="">Select Category</option>
                <option value="brazilian" ${product.category === 'brazilian' ? 'selected' : ''}>Brazilian</option>
                <option value="peruvian" ${product.category === 'peruvian' ? 'selected' : ''}>Peruvian</option>
                <option value="malaysian" ${product.category === 'malaysian' ? 'selected' : ''}>Malaysian</option>
                <option value="indian" ${product.category === 'indian' ? 'selected' : ''}>Indian</option>
                <option value="accessories" ${product.category === 'accessories' ? 'selected' : ''}>Accessories</option>
                <option value="extensions" ${product.category === 'extensions' ? 'selected' : ''}>Extensions</option>
                <option value="wigs" ${product.category === 'wigs' ? 'selected' : ''}>Wigs</option>
                <option value="closures" ${product.category === 'closures' ? 'selected' : ''}>Closures</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="editProductType">Type</label>
              <input
                type="text"
                id="editProductType"
                class="form-control"
                value="${SecurityUtils.sanitizeInput(product.type || '')}"
                required
              />
            </div>
            
            <div class="form-group">
              <label for="editProductLength">Length</label>
              <input 
                type="text" 
                id="editProductLength" 
                class="form-control" 
                value="${SecurityUtils.sanitizeInput(product.length || '')}"
              />
            </div>
            
            <div class="form-group">
              <label for="editProductTexture">Texture</label>
              <input 
                type="text" 
                id="editProductTexture" 
                class="form-control" 
                value="${SecurityUtils.sanitizeInput(product.texture || '')}"
              />
            </div>
            
            <div class="form-group">
              <label for="editProductColor">Color</label>
              <input 
                type="text" 
                id="editProductColor" 
                class="form-control" 
                value="${SecurityUtils.sanitizeInput(product.color || '')}"
              />
            </div>
            
            <div class="form-group">
              <label for="editProductQuality">Quality</label>
              <input
                type="text"
                id="editProductQuality"
                class="form-control"
                value="${SecurityUtils.sanitizeInput(product.quality || 'Premium')}"
              />
            </div>
            
            <div class="form-group">
              <label>
                <input type="checkbox" id="editProductActive" ${product.isActive !== false ? 'checked' : ''}>
                Product is Active
              </label>
            </div>
            
            <div class="form-group">
              <label for="editProductImages">Update Product Images</label>
              <input
                type="file"
                id="editProductImages"
                class="form-control"
                accept="image/*"
                multiple
              />
              <small>Select new images to replace existing ones</small>
            </div>
            
            ${product.images && product.images.length > 0 ? `
            <div class="form-group">
              <label>Current Images</label>
              <div class="image-preview-container" id="currentImagesPreview">
                ${product.images.map((img, index) => `
                  <div class="image-preview">
                    <img src="${img}" alt="Product Image ${index + 1}">
                    <button type="button" class="remove-image" onclick="removeProductImage('${productId}', '${img}')">×</button>
                  </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
            
            <div style="margin-top:20px;display:flex;gap:10px;">
              <button type="submit" class="action-btn" id="updateProductBtn">
                Update Product
              </button>
              <button type="button" class="action-btn btn-danger" onclick="closeModal()">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submit handler
    document.getElementById('editProductForm').addEventListener('submit', handleEditProductSubmit);
  } catch (error) {
    console.error('Edit product error:', error);
    showNotification('Failed to load product edit form', 'error');
  }
}

async function handleEditProductSubmit(e) {
  e.preventDefault();
  
  const productId = document.getElementById('editProductId').value;
  const updateProductBtn = document.getElementById('updateProductBtn');
  const originalText = updateProductBtn.textContent;

  // Show loading state
  updateProductBtn.textContent = "Updating...";
  updateProductBtn.disabled = true;

  try {
    const formData = new FormData();

    // Add text fields
    formData.append("name", document.getElementById("editProductName").value);
    formData.append("description", document.getElementById("editProductDescription").value);
    formData.append("price", document.getElementById("editProductPrice").value);
    formData.append("stock", document.getElementById("editProductStock").value);
    formData.append("category", document.getElementById("editProductCategory").value);
    formData.append("type", document.getElementById("editProductType").value);
    formData.append("length", document.getElementById("editProductLength").value);
    formData.append("texture", document.getElementById("editProductTexture").value);
    formData.append("color", document.getElementById("editProductColor").value);
    formData.append("quality", document.getElementById("editProductQuality").value);
    formData.append("isActive", document.getElementById("editProductActive").checked ? "true" : "false");

    const oldPrice = document.getElementById("editProductOldPrice").value;
    if (oldPrice) {
      formData.append("oldPrice", oldPrice);
    }

    // Add new image files
    const imageFiles = document.getElementById("editProductImages").files;
    for (let i = 0; i < imageFiles.length; i++) {
      formData.append("images", imageFiles[i]);
    }

    const response = await fetch(`${ENDPOINTS.PRODUCTS}/${productId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${AppState.authToken}`,
      },
      body: formData,
    });

    if (response.ok) {
      showNotification("Product updated successfully!", "success");
      closeModal();
      loadProducts(AppState.currentPage);
    } else {
      const error = await response.json();
      showNotification(error.error || "Error updating product", "error");
    }
  } catch (error) {
    console.error("Error updating product:", error);
    showNotification("Error updating product", "error");
  } finally {
    // Reset button state
    updateProductBtn.textContent = originalText;
    updateProductBtn.disabled = false;
  }
}

async function removeProductImage(productId, imageUrl) {
  if (!confirm("Are you sure you want to remove this image?")) {
    return;
  }

  try {
    const result = await ApiClient.authenticatedRequest(
      `${ENDPOINTS.PRODUCTS}/${productId}/images`,
      {
        method: "DELETE",
        body: JSON.stringify({ imageUrl })
      }
    );

    if (result.ok) {
      showNotification("Image removed successfully", "success");
      // Refresh the product edit form
      closeModal();
      editProduct(productId);
    } else {
      throw new Error(result.error || "Failed to remove image");
    }
  } catch (error) {
    console.error("Remove product image error:", error);
    showNotification("Failed to remove image", "error");
  }
}

async function handleAddProduct(e) {
  e.preventDefault();

  const saveProductBtn = document.getElementById("saveProductBtn");
  const originalText = saveProductBtn.textContent;

  // Show loading state
  saveProductBtn.textContent = "Saving...";
  saveProductBtn.disabled = true;

  try {
    const formData = new FormData();

    // Add text fields
    formData.append("name", document.getElementById("productName").value);
    formData.append(
      "description",
      document.getElementById("productDescription").value
    );
    formData.append(
      "price",
      document.getElementById("productPrice").value
    );
    formData.append(
      "stock",
      document.getElementById("productStock").value
    );
    formData.append(
      "category",
      document.getElementById("productCategory").value
    );
    formData.append("type", document.getElementById("productType").value);
    formData.append(
      "length",
      document.getElementById("productLength").value
    );
    formData.append(
      "texture",
      document.getElementById("productTexture").value
    );
    formData.append(
      "color",
      document.getElementById("productColor").value
    );
    formData.append(
      "quality",
      document.getElementById("productQuality").value
    );
    formData.append("isActive", "true");

    const oldPrice = document.getElementById("productOldPrice").value;
    if (oldPrice) {
      formData.append("oldPrice", oldPrice);
    }

    // Add image files
    const imageFiles = document.getElementById("productImages").files;
    for (let i = 0; i < imageFiles.length; i++) {
      formData.append("images", imageFiles[i]);
    }

    const response = await fetch(ENDPOINTS.PRODUCTS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AppState.authToken}`,
      },
      body: formData,
    });

    if (response.ok) {
      showNotification("Product added successfully!", "success");
      document.getElementById("addProductForm").style.display = "none";
      document.getElementById("productForm").reset();
      loadProducts(AppState.currentPage);
    } else {
      const error = await response.json();
      showNotification(error.error || "Error adding product", "error");
    }
  } catch (error) {
    console.error("Error adding product:", error);
    showNotification("Error adding product", "error");
  } finally {
    // Reset button state
    saveProductBtn.textContent = originalText;
    saveProductBtn.disabled = false;
  }
}

async function deleteProduct(productId) {
  if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) {
    return;
  }

  try {
    const response = await ApiClient.authenticatedRequest(
      `${ENDPOINTS.PRODUCTS}/${productId}`,
      {
        method: "DELETE",
      }
    );

    if (response.ok) {
      showNotification("Product deleted successfully!", "success");
      loadProducts(AppState.currentPage);
    } else {
      showNotification("Error deleting product", "error");
    }
  } catch (error) {
    console.error("Error deleting product:", error);
    showNotification("Error deleting product", "error");
  }
}

// Add to admindashboard.html in the script section
function previewMultipleImages(input) {
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewGrid = document.getElementById('imagePreviews');
  
  // Clear previous previews
  previewGrid.innerHTML = '';
  
  if (input.files && input.files.length > 0) {
    previewContainer.style.display = 'block';
    
    for (let i = 0; i < input.files.length; i++) {
      const file = input.files[i];
      const reader = new FileReader();
      
      reader.onload = function(e) {
        const previewDiv = document.createElement('div');
        previewDiv.className = 'image-preview-item';
        previewDiv.innerHTML = `
          <div class="image-preview">
            <img src="${e.target.result}" alt="Preview ${i + 1}">
            <div class="image-preview-info">
              <span>Image ${i + 1}</span>
              ${i === 0 ? '<span class="main-image-badge">Main</span>' : ''}
            </div>
            <button type="button" class="remove-preview" onclick="removeImagePreview(${i})">×</button>
          </div>
        `;
        previewGrid.appendChild(previewDiv);
      };
      
      reader.readAsDataURL(file);
    }
  } else {
    previewContainer.style.display = 'none';
  }
}

function removeImagePreview(index) {
  const input = document.getElementById('productImages');
  const dt = new DataTransfer();
  const files = Array.from(input.files);
  
  // Remove file from files array
  files.splice(index, 1);
  
  // Update file input
  files.forEach(file => dt.items.add(file));
  input.files = dt.files;
  
  // Refresh preview
  previewMultipleImages(input);
}

// ==================== ENHANCED REPORTS & CHARTS - UPDATED ====================
async function loadReports() {
  try {
    console.log("📊 Loading reports...");
    
    const days = document.getElementById("reportRange").value;
    const result = await ApiClient.authenticatedRequest(
      `${ENDPOINTS.SALES_ANALYTICS}?days=${days}`
    );

    if (result.ok && result.data) {
      displayReportSummary(result.data);
    } else {
      displayReportSummary({
        totalSales: 0,
        totalOrders: 0,
        totalBookings: 0,
        averageOrderValue: 0,
        period: `${days} days`
      });
      showNotification("Using demo report data", "warning");
    }
  } catch (error) {
    ErrorHandler.handleApiError(error, "Reports loading");
    displayReportSummary({
      totalSales: 0,
      totalOrders: 0,
      totalBookings: 0,
      averageOrderValue: 0,
      period: "selected period"
    });
  }
}

function displayReportSummary(data) {
  const summaryContainer = document.getElementById("reportSummary");
  
  if (!data || Object.keys(data).length === 0) {
    summaryContainer.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <p>No data available for the selected period.</p>
      </div>
    `;
    return;
  }

  // Calculate additional metrics
  const totalRevenue = (data.sales?.totalSales || 0) + (data.bookings?.bookingRevenue || 0);
  const orderPercentage = totalRevenue > 0 ? ((data.sales?.totalSales || 0) / totalRevenue * 100).toFixed(1) : 0;
  const bookingPercentage = totalRevenue > 0 ? ((data.bookings?.bookingRevenue || 0) / totalRevenue * 100).toFixed(1) : 0;
  
  summaryContainer.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <h3>Total Revenue</h3>
        <div class="value">€${totalRevenue.toFixed(2)}</div>
      </div>
      <div class="kpi-card">
        <h3>Total Orders</h3>
        <div class="value">${data.sales?.totalOrders || 0}</div>
      </div>
      <div class="kpi-card">
        <h3>Total Bookings</h3>
        <div class="value">${data.bookings?.totalBookings || 0}</div>
      </div>
      <div class="kpi-card">
        <h3>New Customers</h3>
        <div class="value">${data.customers?.newCustomers || 0}</div>
      </div>
    </div>
    
    <div style="margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div class="dashboard-card">
        <h4>Revenue Breakdown</h4>
        <div style="margin-top: 15px;">
          <p><strong>Product Sales:</strong> €${data.sales?.totalSales?.toFixed(2) || 0} (${orderPercentage}%)</p>
          <div style="height: 10px; background: #f0f0f0; border-radius: 5px; margin: 5px 0 15px 0;">
            <div style="height: 100%; width: ${orderPercentage}%; background: var(--cream); border-radius: 5px;"></div>
          </div>
          
          <p><strong>Booking Revenue:</strong> €${data.bookings?.bookingRevenue?.toFixed(2) || 0} (${bookingPercentage}%)</p>
          <div style="height: 10px; background: #f0f0f0; border-radius: 5px; margin: 5px 0 15px 0;">
            <div style="height: 100%; width: ${bookingPercentage}%; background: #c8b4a8; border-radius: 5px;"></div>
          </div>
        </div>
      </div>
      
      <div class="dashboard-card">
        <h4>Performance Metrics</h4>
        <div style="margin-top: 15px;">
          <p><strong>Avg Order Value:</strong> €${data.sales?.averageOrderValue?.toFixed(2) || 0}</p>
          <p><strong>Avg Booking Value:</strong> €${data.bookings?.averageBookingValue?.toFixed(2) || 0}</p>
          <p><strong>Report Period:</strong> Last ${data.period || '30'} days</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
    
    ${data.sales?.dailyData && data.sales.dailyData.length > 0 ? `
    <div class="dashboard-card" style="margin-top: 20px;">
      <h4>Daily Sales Trend</h4>
      <div style="height: 200px; margin-top: 15px; display: flex; align-items: flex-end; gap: 10px; padding: 10px; border: 1px solid var(--light-bg); border-radius: 8px;">
        ${data.sales.dailyData.map(day => {
          const maxAmount = Math.max(...data.sales.dailyData.map(d => d.amount));
          const height = maxAmount > 0 ? (day.amount / maxAmount * 150) : 0;
          return `
            <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
              <div style="width: 30px; height: ${height}px; background: var(--cream); border-radius: 4px 4px 0 0;"></div>
              <div style="font-size: 10px; margin-top: 5px; transform: rotate(-45deg);">${day.date.split('-')[2]}/${day.date.split('-')[1]}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}
  `;
}

function generateReport() {
  loadReports();
}

async function exportReport(format) {
  try {
    const days = document.getElementById("reportRange").value;
    let url;
    let filename;
    
    switch(format) {
      case 'csv':
        // You can modify this to include different report types
        url = `${ENDPOINTS.EXPORT_CSV}?days=${days}&type=summary`;
        filename = `sales_report_${days}_days_${new Date().toISOString().split('T')[0]}.csv`;
        break;
        
      case 'pdf':
        url = `${ENDPOINTS.EXPORT_PDF}?days=${days}`;
        filename = `sales_report_${days}_days_${new Date().toISOString().split('T')[0]}.pdf`;
        break;
        
      case 'detailed-pdf':
        url = `${ENDPOINTS.EXPORT_DETAILED_PDF}?days=${days}`;
        filename = `detailed_report_${days}_days_${new Date().toISOString().split('T')[0]}.pdf`;
        break;
        
      default:
        showNotification('Invalid export format', 'error');
        return;
    }
    
    // Show loading notification
    const loadingNotification = showNotification(`Generating ${format.toUpperCase()} report...`, 'info');
    
    // Make the API request
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AppState.authToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.statusText}`);
    }
    
    // Get the blob data
    const blob = await response.blob();
    
    // Create download link
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    window.URL.revokeObjectURL(downloadUrl);
    
    showNotification(`${format.toUpperCase()} report downloaded successfully!`, 'success');
    
  } catch (error) {
    console.error('Export error:', error);
    showNotification(`Failed to export ${format.toUpperCase()}: ${error.message}`, 'error');
  }
}

// ==================== ENHANCED USERS MANAGEMENT ====================
async function loadUsers() {
  try {
    console.log("🔄 Loading users...");
    
    const result = await ApiClient.authenticatedRequest(ENDPOINTS.USERS);
    
    if (result.ok) {
      AppState.users = result.data.users || result.data;
      renderUsers(AppState.users);
      showNotification(`Loaded ${AppState.users.length} users`, "success");
    } else {
      // Fallback to mock users
      const mockUsers = getMockUsers();
      renderUsers(mockUsers);
      showNotification("Using demo users data", "warning");
    }
  } catch (error) {
    ErrorHandler.handleApiError(error, "Users loading");
  }
}

function renderUsers(users) {
  const tableBody = document.getElementById("usersTableBody");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (!users || users.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No users found</td></tr>';
    return;
  }

  users.forEach((user) => {
    const row = document.createElement("tr");
    const lastActive = user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Never';
    const statusClass = user.isSuspended ? 'status-cancelled' : 'status-completed';
    const statusText = user.isSuspended ? 'Suspended' : 'Active';
    
    row.innerHTML = `
      <td>${SecurityUtils.sanitizeInput(user.firstName || user.name || '')} ${SecurityUtils.sanitizeInput(user.lastName || '')}</td>
      <td>${SecurityUtils.sanitizeInput(user.email)}</td>
      <td>${user.role || 'Customer'}</td>
      <td>${user.orderCount || 0}</td>
      <td>${user.bookingCount || 0}</td>
      <td>${lastActive}</td>
      <td>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </td>
      <td>
        <button class="action-btn view-user" data-id="${user._id || user.id}">View</button>
        <button class="action-btn btn-warning edit-user" data-id="${user._id || user.id}">Edit</button>
        <button class="action-btn ${user.isSuspended ? 'btn-success' : 'btn-danger'} suspend-user" data-id="${user._id || user.id}" data-status="${user.isSuspended ? 'active' : 'suspended'}">
          ${user.isSuspended ? 'Activate' : 'Suspend'}
        </button>
      </td>
    `;

    tableBody.appendChild(row);
  });

  // Add event listeners
  document.querySelectorAll('.view-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const userId = e.target.dataset.id;
      viewUserDetails(userId);
    });
  });

  document.querySelectorAll('.edit-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const userId = e.target.dataset.id;
      editUser(userId);
    });
  });

  document.querySelectorAll('.suspend-user').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const userId = e.target.dataset.id;
      const action = e.target.dataset.status;
      toggleUserSuspension(userId, action);
    });
  });
}

function getMockUsers() {
  return [
    {
      _id: 'user_1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      role: 'Customer',
      orderCount: 3,
      bookingCount: 1,
      lastActive: new Date(),
      isSuspended: false,
      phone: '+1234567890',
      address: '123 Main St, City, Country'
    },
    {
      _id: 'user_2',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      role: 'Customer',
      orderCount: 5,
      bookingCount: 2,
      lastActive: new Date(Date.now() - 86400000),
      isSuspended: true,
      phone: '+0987654321',
      address: '456 Oak Ave, Town, Country'
    },
    // Add more mock users from the image
    {
      _id: 'user_3',
      name: 'Olys Shop',
      email: 'olys@shop.com',
      role: 'admin',
      orderCount: 0,
      bookingCount: 0,
      lastActive: null,
      isSuspended: false
    },
    {
      _id: 'user_4',
      name: 'Ange Boyz',
      email: 'angeboyz27@gmail.com',
      role: 'customer',
      orderCount: 0,
      bookingCount: 0,
      lastActive: null,
      isSuspended: false
    },
    {
      _id: 'user_5',
      name: 'Jaja jaja',
      email: 'pokam.jafercine@yahoo.com',
      role: 'customer',
      orderCount: 0,
      bookingCount: 0,
      lastActive: null,
      isSuspended: false
    },
    {
      _id: 'user_6',
      name: 'REMY STEPHANE ETOA',
      email: 'etoaremy@icloud.com',
      role: 'admin',
      orderCount: 0,
      bookingCount: 0,
      lastActive: null,
      isSuspended: false
    },
    {
      _id: 'user_7',
      name: 'Grace Ange',
      email: 'grace@gmail.com',
      role: 'admin',
      orderCount: 0,
      bookingCount: 0,
      lastActive: null,
      isSuspended: false
    },
    {
      _id: 'user_8',
      name: 'CHESSEU NJIPDI TERTULLIEN',
      email: 'olyshair@gmail.com',
      role: 'admin',
      orderCount: 0,
      bookingCount: 0,
      lastActive: null,
      isSuspended: false
    },
    {
      _id: 'user_9',
      name: 'remy stephane',
      email: 'remystephaneetoactoa@gmail.com',
      role: 'customer',
      orderCount: 0,
      bookingCount: 0,
      lastActive: null,
      isSuspended: false
    },
    {
      _id: 'user_10',
      name: 'David Obin',
      email: 'davidobin2@gmail.com',
      role: 'customer',
      orderCount: 0,
      bookingCount: 0,
      lastActive: null,
      isSuspended: false
    }
  ];
}

async function viewUserDetails(userId) {
  try {
    // Find user in current state or fetch from API
    let user = AppState.users.find(u => u._id === userId);
    
    if (!user) {
      // Try to fetch user details from API
      const result = await ApiClient.authenticatedRequest(`${ENDPOINTS.USERS}/${userId}`);
      if (result.ok) {
        user = result.data;
      } else {
        showNotification('User not found', 'error');
        return;
      }
    }

    // Parse name if it's a combined field
    let firstName = user.firstName || '';
    let lastName = user.lastName || '';
    
    if (!firstName && user.name) {
      const nameParts = user.name.split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    const modalHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3>User Details</h3>
            <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;">×</button>
          </div>
          
          <div class="user-details">
            <div class="detail-section">
              <h4>Personal Information</h4>
              <p><strong>Name:</strong> ${firstName} ${lastName}</p>
              <p><strong>Email:</strong> ${user.email}</p>
              <p><strong>Role:</strong> ${user.role}</p>
              <p><strong>Status:</strong> <span class="status-badge ${user.isSuspended ? 'status-cancelled' : 'status-completed'}">${user.isSuspended ? 'Suspended' : 'Active'}</span></p>
            </div>
            
            <div class="detail-section">
              <h4>Contact Information</h4>
              <p><strong>Phone:</strong> ${user.phone || 'Not provided'}</p>
              <p><strong>Address:</strong> ${user.address || 'Not provided'}</p>
            </div>
            
            <div class="detail-section">
              <h4>Activity Summary</h4>
              <p><strong>Total Orders:</strong> ${user.orderCount || 0}</p>
              <p><strong>Total Bookings:</strong> ${user.bookingCount || 0}</p>
              <p><strong>Last Active:</strong> ${user.lastActive ? new Date(user.lastActive).toLocaleString() : 'Never'}</p>
              <p><strong>Member Since:</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</p>
            </div>
            
            ${user.notes ? `
            <div class="detail-section">
              <h4>Admin Notes</h4>
              <p>${user.notes}</p>
            </div>
            ` : ''}
          </div>
          
          <div style="margin-top:20px;display:flex;gap:10px;">
            <button class="action-btn btn-warning" onclick="editUser('${userId}'); closeModal();">Edit User</button>
            <button class="action-btn ${user.isSuspended ? 'btn-success' : 'btn-danger'}" onclick="toggleUserSuspension('${userId}', '${user.isSuspended ? 'active' : 'suspended'}'); closeModal();">
              ${user.isSuspended ? 'Activate User' : 'Suspend User'}
            </button>
            <button class="action-btn" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  } catch (error) {
    console.error('View user error:', error);
    showNotification('Failed to load user details', 'error');
  }
}

async function editUser(userId) {
  try {
    // Find user in current state or fetch from API
    let user = AppState.users.find(u => u._id === userId);
    
    if (!user) {
      // Try to fetch user details from API
      const result = await ApiClient.authenticatedRequest(`${ENDPOINTS.USERS}/${userId}`);
      if (result.ok) {
        user = result.data;
      } else {
        showNotification('User not found', 'error');
        return;
      }
    }

    // Parse name if it's a combined field
    let firstName = user.firstName || '';
    let lastName = user.lastName || '';
    
    if (!firstName && user.name) {
      const nameParts = user.name.split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    const modalHTML = `
      <div class="modal-overlay">
        <div class="modal-content">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3>Edit User</h3>
            <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;">×</button>
          </div>
          
          <form id="editUserForm">
            <input type="hidden" id="editUserId" value="${userId}">
            
            <div class="form-group">
              <label for="editFirstName">First Name</label>
              <input type="text" id="editFirstName" class="form-control" value="${firstName}" required>
            </div>
            
            <div class="form-group">
              <label for="editLastName">Last Name</label>
              <input type="text" id="editLastName" class="form-control" value="${lastName}" required>
            </div>
            
            <div class="form-group">
              <label for="editEmail">Email</label>
              <input type="email" id="editEmail" class="form-control" value="${user.email}" required>
            </div>
            
            <div class="form-group">
              <label for="editPhone">Phone</label>
              <input type="tel" id="editPhone" class="form-control" value="${user.phone || ''}">
            </div>
            
            <div class="form-group">
              <label for="editAddress">Address</label>
              <textarea id="editAddress" class="form-control" rows="3">${user.address || ''}</textarea>
            </div>
            
            <div class="form-group">
              <label for="editRole">Role</label>
              <select id="editRole" class="form-control">
                <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Customer</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="editNotes">Admin Notes</label>
              <textarea id="editNotes" class="form-control" rows="3">${user.notes || ''}</textarea>
            </div>
            
            <div class="form-group">
              <label>
                <input type="checkbox" id="editIsSuspended" ${user.isSuspended ? 'checked' : ''}>
                Suspend User Account
              </label>
              <small style="display:block;color:#666;">Suspended users cannot log in or place orders</small>
            </div>
            
            <div style="margin-top:20px;display:flex;gap:10px;">
              <button type="submit" class="action-btn">Save Changes</button>
              <button type="button" class="action-btn btn-danger" onclick="closeModal()">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add form submit handler
    document.getElementById('editUserForm').addEventListener('submit', handleEditUserSubmit);
  } catch (error) {
    console.error('Edit user error:', error);
    showNotification('Failed to load user edit form', 'error');
  }
}

async function handleEditUserSubmit(e) {
  e.preventDefault();
  
  const userId = document.getElementById('editUserId').value;
  const firstName = document.getElementById('editFirstName').value;
  const lastName = document.getElementById('editLastName').value;
  const email = document.getElementById('editEmail').value;
  const phone = document.getElementById('editPhone').value;
  const address = document.getElementById('editAddress').value;
  const role = document.getElementById('editRole').value;
  const notes = document.getElementById('editNotes').value;
  const isSuspended = document.getElementById('editIsSuspended').checked;
  
  try {
    const result = await ApiClient.authenticatedRequest(
      `${ENDPOINTS.USER_DETAILS}/${userId}`,  // Use correct endpoint
      {
        method: 'PUT',
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          address,
          role,
          notes,
          isSuspended
        })
      }
    );
    
    if (result.ok) {
      showNotification('User updated successfully', 'success');
      closeModal();
      loadUsers(); // Refresh the user list
    } else {
      throw new Error(result.error || 'Failed to update user');
    }
  } catch (error) {
    console.error('Update user error:', error);
    showNotification('Failed to update user', 'error');
  }
}

async function toggleUserSuspension(userId, action) {
  const isSuspending = action === 'suspended';
  const confirmMessage = isSuspending 
    ? 'Are you sure you want to suspend this user? They will not be able to log in or place orders.'
    : 'Are you sure you want to activate this user?';
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    const result = await ApiClient.authenticatedRequest(
      `${ENDPOINTS.USER_STATUS}/${userId}/status`,  // Correct endpoint
      {
        method: 'PUT',
        body: JSON.stringify({
          isSuspended: isSuspending,
          reason: isSuspending ? 'Suspended by admin' : null
        })
      }
    );
    
    if (result.ok) {
      showNotification(`User ${isSuspending ? 'suspended' : 'activated'} successfully`, 'success');
      loadUsers(); // Refresh the user list
    } else {
      throw new Error(result.error || `Failed to ${isSuspending ? 'suspend' : 'activate'} user`);
    }
  } catch (error) {
    console.error('Toggle user suspension error:', error);
    showNotification(`Failed to ${isSuspending ? 'suspend' : 'activate'} user`, 'error');
  }
}

// ==================== ENHANCED EVENT HANDLERS ====================
async function handleLogin(e) {
  e.preventDefault();

  const email = SecurityUtils.sanitizeInput(
    document.getElementById("loginEmail").value
  );
  const password = document.getElementById("loginPassword").value;

  if (!SecurityUtils.validateEmail(email)) {
    showNotification("Please enter a valid email address", "error");
    return;
  }

  const loginBtn = document.getElementById("loginBtn");
  const loginBtnText = document.getElementById("loginBtnText");
  const loginLoading = document.getElementById("loginLoading");

  // Show loading state
  loginBtnText.textContent = "Logging in...";
  loginLoading.style.display = "inline-block";
  loginBtn.disabled = true;

  try {
    console.log("🔐 Attempting admin login...");
    const result = await ApiClient.request(ENDPOINTS.ADMIN_LOGIN, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (result.ok && result.data.token) {
      // Save token and user info
      AppState.authToken = result.data.token;
      localStorage.setItem("adminToken", AppState.authToken);
      AppState.currentUser = result.data.user;
      AppState.isTokenVerified = true;

      console.log("✅ Login successful, token saved");
      showNotification("Login successful!", "success");
      showDashboard();
    } else {
      throw new Error(result.error || "Login failed");
    }
  } catch (error) {
    ErrorHandler.handleApiError(error, "Login");
  } finally {
    // Reset button state
    loginBtnText.textContent = "Login";
    loginLoading.style.display = "none";
    loginBtn.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();

  const firstName = SecurityUtils.sanitizeInput(
    document.getElementById("registerFirstName").value
  );
  const lastName = SecurityUtils.sanitizeInput(
    document.getElementById("registerLastName").value
  );
  const email = SecurityUtils.sanitizeInput(
    document.getElementById("registerEmail").value
  );
  const password = document.getElementById("registerPassword").value;
  const phoneNumber = SecurityUtils.sanitizeInput(
    document.getElementById("registerPhone").value
  );

  if (!SecurityUtils.validateEmail(email)) {
    showNotification("Please enter a valid email address", "error");
    return;
  }

  const registerBtn = document.getElementById("registerBtn");
  const registerBtnText = document.getElementById("registerBtnText");
  const registerLoading = document.getElementById("registerLoading");

  // Show loading state
  registerBtnText.textContent = "Registering...";
  registerLoading.style.display = "inline-block";
  registerBtn.disabled = true;

  try {
    const result = await ApiClient.request(ENDPOINTS.ADMIN_REGISTER, {
      method: "POST",
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
        phoneNumber,
      }),
    });

    if (result.ok) {
      showNotification(
        "Registration successful! Please login.",
        "success"
      );
      showLogin();
      document.getElementById("registerForm").reset();
    } else {
      throw new Error(result.error || "Registration failed");
    }
  } catch (error) {
    ErrorHandler.handleApiError(error, "Registration");
  } finally {
    // Reset button state
    registerBtnText.textContent = "Register";
    registerLoading.style.display = "none";
    registerBtn.disabled = false;
  }
}

function handleLogout() {
  console.log("🚪 Logging out admin...");
  localStorage.removeItem("adminToken");
  AppState.authToken = null;
  AppState.currentUser = null;
  AppState.isTokenVerified = false;
  CacheManager.clear();
  showNotification("Logged out successfully", "success");
  showLogin();
}

// ==================== ENHANCED PERFORMANCE MONITORING ====================
function setupPerformanceMonitoring() {
  // Monitor memory usage
  if (performance.memory) {
    setInterval(() => {
      const used = performance.memory.usedJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;
      const percentage = (used / limit) * 100;

      if (percentage > 80) {
        console.warn(
          "⚠️ High memory usage detected:",
          percentage.toFixed(2) + "%"
        );
        CacheManager.clear();
      }
    }, 30000);
  }
}

// ==================== ENHANCED UTILITY FUNCTIONS ====================
function showNotification(message, type = "info") {
  const notificationContainer = document.getElementById(
    "notificationContainer"
  );
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = SecurityUtils.sanitizeInput(message);

  notificationContainer.appendChild(notification);

  // Show notification with animation
  setTimeout(() => {
    notification.classList.add("show");
  }, 100);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 5000);
}

function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
}

// ==================== ENHANCED EVENT LISTENER SETUP ====================
function setupEventListeners() {
  // Login/Register forms
  document
    .getElementById("loginForm")
    .addEventListener("submit", handleLogin);
  document
    .getElementById("registerForm")
    .addEventListener("submit", handleRegister);
  document
    .getElementById("showRegister")
    .addEventListener("click", showRegister);
  document
    .getElementById("showLogin")
    .addEventListener("click", showLogin);
  document
    .getElementById("logoutBtn")
    .addEventListener("click", handleLogout);

  // Product management
  const addProductBtn = document.getElementById("addProductBtn");
  const cancelAddProduct = document.getElementById("cancelAddProduct");
  const productForm = document.getElementById("productForm");

  if (addProductBtn) {
    addProductBtn.addEventListener("click", () => {
      document.getElementById("addProductForm").style.display = "block";
    });
  }

  if (cancelAddProduct) {
    cancelAddProduct.addEventListener("click", () => {
      document.getElementById("addProductForm").style.display = "none";
      productForm.reset();
    });
  }

  if (productForm) {
    productForm.addEventListener("submit", handleAddProduct);
  }

  // Search functionality with enhanced debouncing
  const productSearch = document.getElementById("productSearch");
  if (productSearch) {
    productSearch.addEventListener(
      "input",
      debounce(filterProducts, 500)
    );
  }

  const orderSearch = document.getElementById("orderSearch");
  if (orderSearch) {
    orderSearch.addEventListener("input", debounce(filterOrders, 500));
  }

  const bookingSearch = document.getElementById("bookingSearch");
  if (bookingSearch) {
    bookingSearch.addEventListener("input", debounce(filterBookings, 500));
  }

  const userSearch = document.getElementById("userSearch");
  if (userSearch) {
    userSearch.addEventListener("input", debounce(filterUsers, 500));
  }

  // Report range change
  const reportRange = document.getElementById("reportRange");
  if (reportRange) {
    reportRange.addEventListener("change", debounce(loadReports, 300));
  }

  // Section navigation
  setupSectionNavigation();

  // Window unload cleanup
  window.addEventListener("beforeunload", () => {
    CacheManager.clear();
  });

  // Refresh bookings button
  const refreshBookingsBtn = document.getElementById('refreshBookingsBtn');
  if (refreshBookingsBtn) {
    refreshBookingsBtn.addEventListener('click', function() {
      console.log('🔄 Manual refresh triggered');
      loadBookings(true);
      showNotification('Refreshing bookings...', 'info');
    });
  }
}

function setupSectionNavigation() {
  const sidebarBubbles = document.querySelectorAll(".sidebar-bubble");

  sidebarBubbles.forEach((bubble) => {
    bubble.addEventListener("click", () => {
      const sectionId = bubble.getAttribute("data-section");
      switchSection(sectionId);
    });
  });
}

// Search and filter functions
function filterProducts() {
  const searchTerm = document.getElementById("productSearch").value.toLowerCase();
  if (!searchTerm) {
    renderProducts(AppState.products);
    return;
  }
  const filteredProducts = AppState.products.filter(product =>
    product.name.toLowerCase().includes(searchTerm) ||
    product.category.toLowerCase().includes(searchTerm)
  );
  renderProducts(filteredProducts);
}

function filterOrders() {
  const searchTerm = document.getElementById("orderSearch").value.toLowerCase();
  if (!searchTerm) {
    renderOrders(AppState.orders);
    return;
  }
  const filteredOrders = AppState.orders.filter(order =>
    order.orderNumber.toLowerCase().includes(searchTerm) ||
    order.customerName.toLowerCase().includes(searchTerm)
  );
  renderOrders(filteredOrders);
}

function filterBookings() {
  const searchTerm = document.getElementById("bookingSearch").value.toLowerCase();
  if (!searchTerm) {
    renderBookings(AppState.bookings);
    return;
  }
  const filteredBookings = AppState.bookings.filter(booking =>
    booking.customerName.toLowerCase().includes(searchTerm) ||
    booking.status.toLowerCase().includes(searchTerm)
  );
  renderBookings(filteredBookings);
}

function filterUsers() {
  const searchTerm = document.getElementById("userSearch").value.toLowerCase();
  if (!searchTerm) {
    renderUsers(AppState.users);
    return;
  }
  const filteredUsers = AppState.users.filter(user => {
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase() || user.name.toLowerCase();
    return userName.includes(searchTerm) ||
           user.email.toLowerCase().includes(searchTerm) ||
           user.role.toLowerCase().includes(searchTerm);
  });
  renderUsers(filteredUsers);
}

// ==================== ADD MISSING FUNCTIONS ====================

// Pagination function
function renderPagination(pagination, type) {
  const paginationContainer = document.getElementById(`${type}Pagination`);
  if (!paginationContainer || !pagination) return;

  const { totalPages, currentPage, hasNext, hasPrev } = pagination;
  
  let paginationHTML = '';
  
  if (hasPrev) {
    paginationHTML += `<button class="action-btn" onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}(${currentPage - 1})">Previous</button>`;
  }
  
  paginationHTML += ` <span style="margin: 0 15px;">Page ${currentPage} of ${totalPages}</span> `;
  
  if (hasNext) {
    paginationHTML += `<button class="action-btn" onclick="load${type.charAt(0).toUpperCase() + type.slice(1)}(${currentPage + 1})">Next</button>`;
  }
  
  paginationContainer.innerHTML = paginationHTML;
}

// ==================== KEEP EXISTING UI CONTROLS ====================
const modeToggle = document.querySelector(".mode-toggle");
const body = document.body;

modeToggle.addEventListener("click", () => {
  body.classList.toggle("dark-mode");
  localStorage.setItem(
    "theme",
    body.classList.contains("dark-mode") ? "dark" : "light"
  );
});

// Check for saved user preference
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  body.classList.add("dark-mode");
}

// User profile dropdown
const userProfile = document.querySelector(".user-profile");
const dropdownMenu = document.querySelector(".dropdown-menu");

userProfile.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdownMenu.classList.toggle("show");
});

document.addEventListener("click", (e) => {
  if (!userProfile.contains(e.target)) {
    dropdownMenu.classList.remove("show");
  }
});

// Header scroll effect
window.addEventListener("scroll", function () {
  const header = document.querySelector("header");
  if (window.scrollY > 100) {
    header.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.1)";
    header.style.padding = "15px 40px";
  } else {
    header.style.boxShadow = "";
    header.style.padding = "20px 40px";
  }
});

// System Diagnostics
async function runDiagnostics() {
  const results = document.getElementById("diagnosticResults");
  results.innerHTML = "Running diagnostics...";

  let diagnosticLog = "";

  try {
    // Test 1: Backend connection
    diagnosticLog += "1. Testing backend connection... ";
    const testResponse = await ApiClient.request(ENDPOINTS.HEALTH);
    if (testResponse.ok) {
      diagnosticLog += "✅ SUCCESS\n";
    } else {
      diagnosticLog += "❌ FAILED\n";
    }

    // Test 2: Bookings API
    diagnosticLog += "2. Testing bookings API... ";
    const bookingsResult = await ApiClient.authenticatedRequest(
      ENDPOINTS.BOOKINGS
    );
    if (bookingsResult.ok) {
      diagnosticLog += `✅ SUCCESS (${bookingsResult.data.bookings?.length || 0} bookings)\n`;
    } else {
      diagnosticLog += "❌ FAILED\n";
    }

    // Test 3: Check authentication
    diagnosticLog += "3. Checking authentication... ";
    const token = localStorage.getItem("adminToken");
    if (token) {
      diagnosticLog += "✅ Token exists\n";
    } else {
      diagnosticLog += "❌ No token found\n";
    }

    // Test 4: Check current user
    diagnosticLog += "4. Current user state... ";
    if (AppState.currentUser) {
      diagnosticLog += `✅ ${AppState.currentUser.firstName} ${AppState.currentUser.lastName}\n`;
    } else {
      diagnosticLog += "❌ No user data\n";
    }
  } catch (error) {
    diagnosticLog += `❌ Error: ${error.message}\n`;
  }

  results.innerHTML = `<pre>${diagnosticLog}</pre>`;
}

// Refresh bookings function
function refreshBookings() {
  console.log('🔄 Force refreshing bookings...');
  CacheManager.clear("bookings");
  CacheManager.clear("bookings_stats");
  loadBookings(true);
}