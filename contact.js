// ===============================
// CONTACT FORM HANDLER
// ===============================
document.addEventListener("DOMContentLoaded", () => {

  const form = document.querySelector(".contact-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const btn = form.querySelector("button");
    
    try {
      btn.disabled = true;
      btn.textContent = "Sending...";

      const name = document.getElementById("name")?.value.trim();
      const email = document.getElementById("email")?.value.trim();
      const subject = document.getElementById("subject")?.value.trim();
      const message = document.getElementById("message")?.value.trim();

      if (!name || !email || !subject || !message) {
        alert("Please fill all fields");
        return;
      }

      const { error } = await window.supabaseClient.rpc("insert_contact_message", {
        p_name: name,
        p_email: email,
        p_subject: subject,
        p_message: message
      });

      if (error) throw error;

      alert("Message sent successfully ✅");

      form.reset();

    } catch (err) {
      console.error("Contact error:", err);
      alert("Failed to send message ❌");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `Send Message <i class="fa-solid fa-paper-plane"></i>`;
    }
  });

});