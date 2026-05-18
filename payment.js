console.log("Payment JS loaded");

document.addEventListener('DOMContentLoaded', () => {

  /* ================= HAMBURGER MENU ================= */
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.getElementById('navLinks');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => navLinks.classList.toggle('show'));
    document.addEventListener('click', e => {
      if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
        navLinks.classList.remove('show');
      }
    });
  }

  /* ================= SELAR PAYMENT ================= */
  const selarBtn = document.querySelector('.selar-btn');
  if (selarBtn) {
    selarBtn.addEventListener('click', () => {
      window.open('https://selar.com/al-bayan-institute', '_blank');
    });
  }

  /* ================= COPY TO CLIPBOARD ================= */
  window.copyText = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      const toast = document.getElementById('copy-toast');
      if (!toast) return;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    });
  };

  /* ================= SUPABASE ================= */
  const SUPABASE_URL = "https://cjrpjekmqrckozrbtwps.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  /* ================= PAYMENT FORM ================= */
  const paymentForm = document.querySelector('.payment-form');
  const successMsg = document.querySelector('.success-msg');
  const errorMsg = document.querySelector('.error-msg');
  const submitBtn = document.querySelector('.submit-btn');

  if (!paymentForm) return;

  successMsg.style.display = 'none';
  errorMsg.style.display = 'none';

  /* ================= CURRENT STUDENT ================= */
  const currentStudent = JSON.parse(sessionStorage.getItem('currentStudent'));
  console.log("Current student from session:", currentStudent);

  // Auto-fill form if logged in
if (currentStudent) {

  document.getElementById('student-name').value =
    currentStudent.fullname || '';

  document.getElementById('student-email').value =
    currentStudent.email || '';

  document.getElementById('country').value =
    currentStudent.country || '';

  // plan type
  if (currentStudent.plan_type) {

    const planSelect =
      document.getElementById('plan-type');

    for (let option of planSelect.options) {

      if (option.value === currentStudent.plan_type) {

        option.selected = true;
        break;
      }
    }
  }

  // level
  if (currentStudent.level) {

    const levelSelect =
      document.getElementById('level-arabic');

    for (let option of levelSelect.options) {

      if (option.text === currentStudent.level) {

        option.selected = true;
        break;
      }
    }
  }
}


paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullname = document.getElementById('student-name').value.trim();
    const email = document.getElementById('student-email').value.trim();
    const country = document.getElementById('country')?.value || null;
    const plan_type = document.getElementById('plan-type')?.value || null;
    const level = document.getElementById('level-arabic').value;
    const method = document.getElementById('payment-method').value.trim();
    const amount = document.getElementById('amount').value;
    
    const currency = document.getElementById("currency").value;
    
    const date = document.getElementById("payment-date")?.value || null;
    const month = document.getElementById('month').value;
    const receiptFile = document.getElementById('receipt')?.files[0] || null;

    if (!fullname || !email || !level || !method || !amount || !month) {
  errorMsg.textContent = t('Please fill all required fields correctly.');
  errorMsg.style.display = 'block';
  successMsg.style.display = 'none';
  return;
}

    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = t('Processing... ⏳');

    try {
      // Upload receipt inside try so errors are caught
      let receipt_url = null;

      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('payment_receipts')
          .upload(fileName, receiptFile);

        if (uploadError) throw uploadError;

        receipt_url = supabase.storage
          .from('payment_receipts')
          .getPublicUrl(fileName).data.publicUrl;
      }

      const insertData = {
        matric_number: currentStudent?.matric_number || null,
        payer_name: fullname || null,
        payer_email: email || null,
        country,
        plan_type,
        level_arabic: level,
        payment_method: method,
        amount: Number(amount),
        currency,
        payment_date: date || null,
        month,
        receipt_url,
        status: "pending"
      };

      const { error } = await supabase.from("payments").insert([insertData]);
      if (error) throw error;

      paymentForm.reset();

      if (currentStudent) {
        document.getElementById('student-name').value = currentStudent.fullname || '';
        document.getElementById('student-email').value = currentStudent.email || '';
      }

      successMsg.textContent = t('Payment submitted successfully. We will confirm shortly.');
      successMsg.style.display = 'block';
      errorMsg.style.display = 'none';

    } catch (err) {
      console.error('Payment submission error:', err);
      errorMsg.textContent = t('Something went wrong: ') + (err.message || JSON.stringify(err));
      errorMsg.style.display = 'block';
      successMsg.style.display = 'none';

    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

});