console.log("Reset password loaded");

// ============================
// ELEMENTS
// ============================
const form = document.getElementById("forgotForm");
const passwordInput = document.getElementById("password");
const confirmInput = document.getElementById("confirmPassword");
const errorMsg = document.querySelector(".error-msg");
const successMsg = document.querySelector(".success-msg");

// ============================
// IMPORTANT: INIT SESSION
// ============================
window.addEventListener("load", async () => {
  await sb.auth.getSession();
});

// ============================
// SUBMIT NEW PASSWORD
// ============================
form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const password = passwordInput.value.trim();
  const confirm = confirmInput.value.trim();

  if (password.length < 6) {
    errorMsg.textContent = t("Password must be at least 6 characters.");
    return;
  }

  if (password !== confirm) {
    errorMsg.textContent = t("Passwords do not match.");
    return;
  }

  try {
    const { data, error } = await sb.auth.updateUser({
      password: password
    });

    if (error) {
      console.error("Update error:", error);
      throw error;
    }

    successMsg.textContent = t("Password updated successfully.");
    errorMsg.textContent = "";

    setTimeout(() => {
      window.location.href = "login.html";
    }, 2000);

  } catch (err) {
    console.error("RESET ERROR:", err);
    errorMsg.textContent = t("Unable to update password.");
    successMsg.textContent = "";
  }
});