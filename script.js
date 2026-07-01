let cart = [];
let total = 0;
const DB_NAME = "shopDB";
const DB_VERSION = 1;
let dbPromise = null;

function isLoggedIn() {
  return localStorage.getItem("loggedIn") === "true";
}

function getCurrentUser() {
  return localStorage.getItem("currentUser") || "";
}

function setCurrentUser(user) {
  if (user) {
    localStorage.setItem("currentUser", user);
  } else {
    localStorage.removeItem("currentUser");
  }
}

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is not supported in this browser."));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains("users")) {
          db.createObjectStore("users", { keyPath: "username" });
        }

        if (!db.objectStoreNames.contains("carts")) {
          db.createObjectStore("carts", { keyPath: "username" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return dbPromise;
}

function getStoredUsers() {
  try {
    const stored = localStorage.getItem("registeredUsers");
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Failed to read registered users:", error);
    return [];
  }
}

function saveStoredUsers(users) {
  localStorage.setItem("registeredUsers", JSON.stringify(users));
}

function getUserFromDatabase(username) {
  const localUser = getStoredUsers().find((user) => user.username === username) || null;

  if (localUser) {
    return Promise.resolve(localUser);
  }

  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("users", "readonly");
      const store = transaction.objectStore("users");
      const request = store.get(username);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  });
}

function saveUserToDatabase(username, password) {
  const users = getStoredUsers();
  if (!users.some((user) => user.username === username)) {
    users.push({ username, password });
    saveStoredUsers(users);
  }

  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("users", "readwrite");
      const store = transaction.objectStore("users");
      const request = store.put({ username, password });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }).catch((error) => {
    console.warn("IndexedDB save failed, using localStorage fallback:", error);
  });
}

function saveCartToDatabase() {
  const user = getCurrentUser();
  if (!user) return Promise.resolve();

  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("carts", "readwrite");
      const store = transaction.objectStore("carts");
      const request = store.put({ username: user, items: cart, total });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }).catch((error) => {
    console.error("Failed to save cart:", error);
  });
}

function loadCartFromDatabase() {
  const user = getCurrentUser();
  if (!user) return Promise.resolve();

  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("carts", "readonly");
      const store = transaction.objectStore("carts");
      const request = store.get(user);

      request.onsuccess = () => {
        const result = request.result;
        cart = result?.items || [];
        total = result?.total || 0;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }).catch((error) => {
    console.error("Failed to load cart:", error);
  });
}

async function register() {
  const user = document.getElementById("regUser").value.trim();
  const pass = document.getElementById("regPass").value;

  if (!user || !pass) {
    alert("Please enter a username and password.");
    return;
  }

  try {
    const existingUser = await getUserFromDatabase(user);
    if (existingUser) {
      alert("This username already exists.");
      return;
    }

    await saveUserToDatabase(user, pass);
    alert("Registered successfully! Please login to continue.");
  } catch (error) {
    console.error(error);
    alert("Registration failed.");
  }
}

async function login() {
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value;

  if (!user || !pass) {
    alert("Please enter your username and password.");
    return;
  }

  try {
    const storedUsers = getStoredUsers();
    const storedUser = await getUserFromDatabase(user);

    if (storedUser && storedUser.password === pass) {
      localStorage.setItem("loggedIn", "true");
      setCurrentUser(user);
      await loadCartFromDatabase();
      window.location.href = "shop.html";
      return;
    }

    if (storedUsers.length === 0) {
      localStorage.setItem("loggedIn", "true");
      setCurrentUser(user);
      await saveUserToDatabase(user, pass);
      await loadCartFromDatabase();
      window.location.href = "shop.html";
      return;
    }

    alert("Invalid login. Please use a registered username and password.");
  } catch (error) {
    console.error(error);
    alert("Login failed.");
  }
}

function logout() {
  localStorage.removeItem("loggedIn");
  setCurrentUser("");
  cart = [];
  total = 0;
  window.location.href = "index.html";
}

function toggleCart(name, price, button) {
  const existingItem = cart.find((item) => item.name === name);

  if (existingItem) {
    cart = cart.filter((item) => item.name !== name);
    total -= price;
  } else {
    cart.push({ name, price });
    total += price;
  }

  renderCart();
  updateCartButtons();
  saveCartToDatabase();

  if (button) {
    button.textContent = existingItem ? "Add to Cart" : "Added";
    button.classList.toggle("active", !existingItem);
  }
}

function removeFromCart(index) {
  const item = cart[index];
  if (!item) return;

  cart.splice(index, 1);
  total -= item.price;
  renderCart();
  updateCartButtons();
  saveCartToDatabase();
}

function updateCartButtons() {
  document.querySelectorAll(".add-btn").forEach((button) => {
    const isInCart = cart.some((item) => item.name === button.dataset.name);
    button.textContent = isInCart ? "Remove" : "Add to Cart";
    button.classList.toggle("active", isInCart);
  });
}

function renderCart() {
  const cartItems = document.getElementById("cartItems");
  const totalSpan = document.getElementById("total");

  if (!cartItems || !totalSpan) return;

  cartItems.innerHTML = "";

  if (cart.length === 0) {
    const emptyMsg = document.createElement("li");
    emptyMsg.textContent = "Your cart is empty";
    cartItems.appendChild(emptyMsg);
  } else {
    cart.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "cart-item";

      const label = document.createElement("span");
      label.textContent = `${item.name} - $${item.price}`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.dataset.index = index;

      li.appendChild(label);
      li.appendChild(removeBtn);
      cartItems.appendChild(li);
    });
  }

  totalSpan.textContent = total;
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.location.pathname.includes("shop.html")) {
    if (!isLoggedIn()) {
      window.location.href = "index.html";
      return;
    }

    await loadCartFromDatabase();
  }

  const buttons = document.querySelectorAll(".category-btn");
  const products = document.querySelectorAll(".product-card");
  const title = document.getElementById("categoryTitle");

  const categoryNames = {
    all: "Popular Picks",
    skin: "Skin Care Picks",
    hair: "Hair Care Picks",
    beauty: "Beauty Picks",
    fashion: "Fashion Picks",
    electronics: "Electronics Picks",
    furniture: "Furniture Picks",
    jewellery: "Jewellery Picks",
    watches: "Watches Picks",
    appliances: "Daily Appliances",
    stationery: "Stationery Picks",
    womens: "Women’s Wear Picks",
    mens: "Men’s Wear Picks",
    kids: "Kids Wear Picks",
    home: "Home Essentials"
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      const category = button.getAttribute("data-category");

      if (title) {
        title.textContent = categoryNames[category] || "Popular Picks";
      }

      products.forEach((product) => {
        const matches = category === "all" || product.getAttribute("data-category") === category;
        product.style.display = matches ? "flex" : "none";
      });
    });
  });

  document.addEventListener("click", (event) => {
    const addButton = event.target.closest(".add-btn");
    if (addButton) {
      event.preventDefault();
      toggleCart(addButton.dataset.name, Number(addButton.dataset.price), addButton);
      return;
    }

    const removeButton = event.target.closest(".remove-btn");
    if (removeButton) {
      event.preventDefault();
      removeFromCart(Number(removeButton.dataset.index));
    }
  });

  renderCart();
  updateCartButtons();
});
