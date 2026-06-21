console.log("Forgot password JS loaded");

const form = document.getElementById("forgotForm");
const emailInput = document.getElementById("email");
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

const userType =
  new URLSearchParams(window.location.search)
    .get("type");

if (form) {

  form.addEventListener("submit", async (e) => {

    e.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
      showError(t("Please enter your email"));
      return;
    }

    try {

      if (userType === "auth") {

        const { error } =
          await sb.auth.resetPasswordForEmail(
            email,
            {
              redirectTo:
                `${window.location.origin}/reset-password.html`
            }
          );

        if (error) throw error;

        showSuccess(
          t("Password reset link sent. Please check your email.")
        );

        emailInput.value = "";

        return;
      }

      const { data: student, error: fetchError } =
        await sb
          .from("students")
          .select("*")
          .eq("email", email)
          .single();

      if (fetchError || !student) {

        showError(
          t("No student found with this email.")
        );

        return;
      }

      const tempPassword =
        Math.random()
          .toString(36)
          .slice(-8);

      const { error: updateError } =
        await sb
          .from("students")
          .update({
            password: tempPassword,
            password_changed: true
          })
          .eq("email", email);

      if (updateError) {

        showError(
          t("Failed to reset password. Try again later.")
        );

        return;
      }

      await sb
        .from("notifications")
        .insert([
          {
            matric_number:
              student.matric_number,
            title:
              t("Password Reset"),
            message:
              `${t("Your temporary password is:")} ${tempPassword}`,
            created_at:
              new Date().toISOString()
          }
        ]);

      successMsg.style.display = "block";
      errorMsg.style.display = "none";

      successMsg.innerHTML = `
        ${t("Temporary password generated:")}
        <div style="display:flex;align-items:center;margin-top:5px;">
          <input
            type="password"
            id="tempPass"
            value="${tempPassword}"
            readonly
            style="
              flex:1;
              padding:5px;
              border:1px solid var(--border-color);
              border-radius:5px;
              margin-right:5px;
            "
          >

          <button
            type="button"
            id="toggleTempPass"
            style="margin-right:5px;"
          >
            👁️
          </button>

          <button
            type="button"
            id="copyTempPass"
          >
            📋
          </button>
        </div>
      `;

      emailInput.value = "";

      const tempPassInput =
        document.getElementById("tempPass");

      document
        .getElementById("toggleTempPass")
        .addEventListener("click", () => {

          tempPassInput.type =
            tempPassInput.type === "password"
              ? "text"
              : "password";
        });

      document
        .getElementById("copyTempPass")
        .addEventListener("click", () => {

          navigator.clipboard.writeText(
            tempPassword
          );

          showSuccess(
            t("Temporary password copied to clipboard!")
          );
        });

    } catch (err) {

      console.error(err);

      showError(
        t("Something went wrong.")
      );
    }

  });

}