console.log("Reset password loaded");

// ============================
// ELEMENTS
// ============================
const form = document.getElementById("forgotForm");
const passwordInput = document.getElementById("password");
const confirmInput = document.getElementById("confirmPassword");
const errorMsg = document.querySelector(".error-msg");
const successMsg = document.querySelector(".success-msg");

function showError(message) {
  errorMsg.style.display = "block";
  successMsg.style.display = "none";

  errorMsg.textContent = message;
  successMsg.textContent = "";
}

function showSuccess(message) {
  successMsg.style.display = "block";
  errorMsg.style.display = "none";

  successMsg.textContent = message;
  errorMsg.textContent = "";
}

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
    showError(
      t("Password must be at least 6 characters.")
    );
    return;
  }

  if (password !== confirm) {
    showError(
      t("Passwords do not match.")
    );
    return;
  }

  try {

    const { error } =
      await sb.auth.updateUser({
        password: password
      });

    if (error) {
      console.error("Update error:", error);
      throw error;
    }

    showSuccess(
      t("Password updated successfully.")
    );

    setTimeout(() => {
      window.location.href = "login.html";
    }, 2000);

  } catch (err) {

    console.error("RESET ERROR:", err);

    showError(
      t("Unable to update password.")
    );
  }

});