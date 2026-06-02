const API   = "https://sistema-backend-i4uh.onrender.com";
const token = localStorage.getItem("token");

if (!token) window.location.href = "login.html";


// Carrega perfil do usuário
fetch(API + "/perfil", {
    headers: { "Authorization": "Bearer " + token }
})
.then(res => { if (!res.ok) throw new Error(); return res.json(); })
.then(data => {
    const username = data.usuario.username;
    const name     = data.usuario.name;
    const displayName = name || username;
    const role = data.usuario.role;

    document.querySelector(".username").innerText = displayName;
    document.getElementById("welcome-name").innerText = displayName;

    if (role === "entregador") {
        document.getElementById("menu-operacao").style.display  = "none";
        document.getElementById("submenu-operacao").style.display  = "none";
        document.getElementById("menu-pedidos").style.display   = "none";
        document.getElementById("submenu-pedidos").style.display   = "none";
        document.getElementById("menu-fechamentos").style.display  = "";
        document.getElementById("submenu-fechamentos").style.display  = "";
        document.getElementById("welcome-name").innerText = displayName.split(" ")[0];
    }

    if (role === "admin") {
        document.getElementById("menu-adminmenu").style.display    = "";
        document.getElementById("submenu-adminmenu").style.display  = "";
        document.getElementById("menu-financeiro").style.display   = "";
        document.getElementById("submenu-financeiro").style.display = "";
        document.getElementById("menu-cadastros").style.display    = "";
        document.getElementById("submenu-cadastros").style.display  = "";
        document.getElementById("menu-extravios").style.display    = "";
        document.getElementById("submenu-extravios").style.display  = "";
    }

    if (role === "sac") {
        document.getElementById("menu-extravios").style.display    = "";
        document.getElementById("submenu-extravios").style.display  = "";
    }

    renderHomeActions(role);
    const badge = document.getElementById("home-role-badge");
    if (badge) badge.innerText = role === "admin" ? "Administrador" : role === "entregador" ? "Entregador" : role === "sac" ? "SAC" : "Operador";
})
.catch(() => {
    localStorage.removeItem("token");
    window.location.href = "login.html";
});
