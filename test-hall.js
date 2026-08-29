// ================= SUPABASE CLIENT =================
const supabaseUrl = "https://cjrpjekmqrckozrbtwps.supabase.co";
const supabaseKey = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
console.log('SUPABASE_LOADED');

// ================= SESSION CHECK =================
const role = sessionStorage.getItem("role");
const matricNumber = sessionStorage.getItem("matric");
const studentData = sessionStorage.getItem("currentStudent");

if (role !== "student" || !matricNumber || !studentData) {
  alert("Session expired");
  window.location.href = "login.html";
  throw new Error("Invalid session");
}

const currentStudent = JSON.parse(studentData);

// ================= DOM ELEMENTS =================
const examTitle = document.getElementById('examTitle');
const examMessage = document.getElementById('examMessage');
const questionsContainer = document.getElementById('questionsContainer');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const reviewBtn = document.getElementById('reviewBtn');
const reviewModal = document.getElementById('reviewModal');
const reviewList = document.getElementById('reviewList');
const finalSubmitBtn = document.getElementById('finalSubmitBtn');
const progressBar = document.getElementById('progressBar');
const countdownBar = document.getElementById('countdownBar');
const timeDisplay = document.getElementById('time');
const timeWarning = document.getElementById('timeWarning');

// ================= STATE =================
let assessmentId = null;
let questions = [];
let currentIndex = 0;
let studentAnswers = {};
let durationMinutes = 0;
let timeRemaining = 0;
let examEndTime = null; // absolute epoch ms timestamp - source of truth for the countdown
let timerInterval;
let warningShown = false;
let testEnded = false;

// ================= SHUFFLE UTIL =================
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ================= CURRENCY HELPERS =================
// Mirrors the same helpers used on students-dashboard.js / student-payments.html
const CURRENCY_SYMBOLS = { NGN: "₦", USD: "$", EUR: "€", GBP: "£" };

function formatMoney(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || currency || "₦";
  return `${symbol}${Number(amount || 0).toLocaleString()}`;
}

function formatGroupedTotals(rows, amountKey) {
  const totals = {};
  (rows || []).forEach(r => {
    const cur = r.currency || "NGN";
    totals[cur] = (totals[cur] || 0) + Number(r[amountKey] || 0);
  });
  const parts = Object.keys(totals).map(cur => formatMoney(totals[cur], cur));
  return parts.length ? parts.join(" + ") : null;
}

// ================= OUTSTANDING PAYMENT MODAL =================
async function showFeeDeniedModal() {
  const modal = document.getElementById("feeDeniedModal");
  if (!modal) return;

  const messageEl  = document.getElementById("feeDeniedMessage");
  const whatsappBtn = document.getElementById("feeDeniedWhatsapp");
  const payBtn     = document.getElementById("feeDeniedPayBtn");
  const closeBtn   = document.getElementById("closeFeeDeniedModal");

  if (closeBtn) {
    closeBtn.onclick = () => { modal.style.display = "none"; };
  }

  // Pull the real outstanding fee details so the modal shows an actual
  // amount and month(s) instead of just a generic denial message
  const { data: outstanding } = await supabaseClient
    .from("student_fee_status")
    .select("month, amount_due, currency")
    .eq("matric_number", matricNumber)
    .eq("status", "unpaid");

  const months = [...new Set((outstanding || []).map(o => o.month))].join(", ");
  const totalDisplay = formatGroupedTotals(outstanding, "amount_due");

  if (messageEl) {
    messageEl.innerHTML = totalDisplay
      ? tmpl("outstanding_message", {
          amount: `<span class="amount-red">${totalDisplay}</span>`,
          months: `<b>${months || "a previous month"}</b>`
        })
      : t("You have an outstanding payment. Please contact the admin or complete your payment to access this exam.");
  }

  if (whatsappBtn) {
    const waMessage = encodeURIComponent(
      `Hello Sir/Madam, I'm trying to access an exam but it says I have an outstanding payment${months ? ` for ${months}` : ""}. Please can you assist me?`
    );
    whatsappBtn.href = `https://wa.me/2348105215518?text=${waMessage}`;
  }

  if (payBtn) {
    payBtn.onclick = () => { window.location.href = "payment.html"; };
  }

  // Only pop the modal once the page has fully finished loading, per request —
  // not immediately alongside the "Access Denied" header text
  const reveal = () => { modal.style.display = "flex"; };
  if (document.readyState === "complete") {
    reveal();
  } else {
    window.addEventListener("load", reveal, { once: true });
  }
}

// ================= CHECK FEES =================
async function checkFees() {
    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];

    const currentMonthName = monthNames[new Date().getMonth()];

    const { data, error } = await supabaseClient
      .from("payments")
      .select("id")
      .eq("matric_number", matricNumber)
      .eq("month", currentMonthName)
      .eq("status", "paid")
      .eq("deleted", false)
      .limit(1);

    if (!data || data.length === 0) {
    examTitle.textContent = "Access Denied";
    examMessage.textContent = "Payment required to access this exam";

    prevBtn.disabled = true;
    nextBtn.disabled = true;
    reviewBtn.disabled = true;
    finalSubmitBtn.disabled = true;

    showFeeDeniedModal();

    return false;
}

    return true;
}    

async function loadActiveAssessment() {
    const hasPaid = await checkFees();
    if (!hasPaid) return;

    // test-welcome.html already resolved the correct assessment for this
    // student's registered course and stored its id. Trust that instead of
    // re-deriving "the" active assessment from level_arabic alone, which
    // could pick an assessment belonging to a different course at the same level.
    const examId = sessionStorage.getItem("examId");

    if (!examId) {
        examTitle.textContent = "No assessment selected";
        examMessage.textContent = "Please start your test/exam from the welcome page";
        return;
    }

    let { data: assessment, error } = await supabaseClient
        .from('assessments')
        .select('*')
        .eq('id', examId)
        .eq('is_active', true)
        .eq('status', 'active')
        .single();

    console.log(currentStudent);

    if (error || !assessment) {
        examTitle.textContent = "No active assessment";
        examMessage.textContent = "Please check back later";
        return;
    }

    // Safety net: confirm this student is actually registered for the
    // course this assessment belongs to, in case examId was tampered with
    // or stale in sessionStorage. Also re-check level + batch using what
    // was snapshotted onto the registration at the time they registered —
    // never the student's current/live level or batch, which may have
    // moved on since (e.g. after a level promotion).
    if (assessment.course_id) {
        const { data: reg, error: regErr } = await supabaseClient
            .from('course_registrations')
            .select('id, level, batch')
            .eq('matric_number', matricNumber)
            .eq('course_id', assessment.course_id)
            .limit(1);

        if (regErr || !reg || reg.length === 0) {
            examTitle.textContent = "Not Registered";
            examMessage.textContent = "You are not registered for this course";
            return;
        }

        const registeredLevel = reg[0].level;
        const registeredBatch = reg[0].batch;
        const levelMatch = !assessment.level_arabic || assessment.level_arabic === registeredLevel;
        const batchMatch = !assessment.batch || assessment.batch === registeredBatch;

        if (!levelMatch || !batchMatch) {
            examTitle.textContent = "Not Available";
            examMessage.textContent = "This exam is not available for your level/batch";
            return;
        }
    }

    assessmentId = assessment.id;

    examTitle.textContent = assessment.title;
    examMessage.textContent = assessment.description || '';
    durationMinutes = assessment.duration_minutes || 30;

    const { count: finalCount } = await supabaseClient
        .from('student_answers')
        .select('id', { count: 'exact', head: true })
        .eq('matric_number', matricNumber)
        .eq('assessment_id', assessmentId)
        .eq('is_final', true);

    if (finalCount === 0) {
        // Record (or fetch) a server-side start time for this attempt. This is
        // the source of truth a backend sweep job uses to auto-finalize/grade
        // students whose time ran out but who never hit submit or closed the
        // tab/lost power before any client-side handler could fire. Using
        // ignoreDuplicates means a page refresh mid-exam does NOT reset the
        // clock - the first-ever start time for this attempt always wins.
        const { data: attemptRow } = await supabaseClient
            .from('exam_attempts')
            .upsert(
                { matric_number: matricNumber, assessment_id: assessmentId },
                { onConflict: 'matric_number,assessment_id', ignoreDuplicates: true }
            )
            .select('started_at')
            .maybeSingle();

        let serverStartedAt = attemptRow?.started_at
            ? new Date(attemptRow.started_at).getTime()
            : null;

        // ignoreDuplicates upserts don't return the existing row, so on a
        // refresh (row already exists) fetch the real started_at explicitly.
        if (!serverStartedAt) {
            const { data: existing } = await supabaseClient
                .from('exam_attempts')
                .select('started_at')
                .eq('matric_number', matricNumber)
                .eq('assessment_id', assessmentId)
                .maybeSingle();
            serverStartedAt = existing?.started_at
                ? new Date(existing.started_at).getTime()
                : Date.now();
        }

        // ===== TIMER FIX =====
        // We no longer trust a stored "secondsRemaining" counter, because it is
        // only ever written when the student clicks next/prev or types an answer.
        // Instead we store/restore an absolute end timestamp (examEndTime) and
        // always derive timeRemaining = examEndTime - now. This survives
        // refreshes, closed tabs, throttled background tabs, etc.
        // The server-recorded start time is now the single source of truth
        // for examEndTime, since a backend sweep job independently derives
        // the same deadline from exam_attempts.started_at. Deriving it the
        // same way here (rather than trusting a client-only timestamp) means
        // the visible countdown and the server's auto-finalize deadline can
        // never drift apart.
        examEndTime = serverStartedAt + durationMinutes * 60 * 1000;
        timeRemaining = Math.max(0, Math.round((examEndTime - Date.now()) / 1000));

        startTimer();
    } else {
        timeRemaining = 0;
        timeDisplay.textContent = '00:00';
        countdownBar.style.width = '0%';
    }
}

// ================= LOAD QUESTIONS =================
async function loadQuestions() {
    if (!assessmentId) return;

    const { count, error: checkError } = await supabaseClient
        .from('student_answers')
        .select('id', { count: 'exact', head: true })
        .eq('matric_number', matricNumber)
        .eq('assessment_id', assessmentId)
        .eq('is_final', true);

    if (checkError) 
    console.error("Check submission error:", error);

    if (count > 0) {
        examMessage.textContent = "You have already attempted this exam";

prevBtn.disabled = true;
nextBtn.disabled = true;
reviewBtn.disabled = true;
finalSubmitBtn.disabled = true;

        return;
    }

    const { data, error } = await supabaseClient
        .from('questions')
        .select('*')
        .eq('assessment_id', assessmentId)
        .neq('deleted', true)
        .order('question_order', { ascending: true });

    if (error || !data || data.length === 0) {
        examMessage.textContent = "No questions available";
        return;
    }

    const { count: draftCount } = await supabaseClient
        .from('student_answers')
        .select('id', { count: 'exact', head: true })
        .eq('matric_number', matricNumber)
        .eq('assessment_id', assessmentId)
        .eq('is_final', false);

    // ================= RESTORE EXAM STATE =================
    const savedState = localStorage.getItem(
        `exam_state_${assessmentId}_${matricNumber}`
    );

    let restored = false;

    if (savedState && draftCount > 0) {
        const state = JSON.parse(savedState);

        currentIndex = state.currentIndex || 0;
        studentAnswers = state.studentAnswers || {};

        // Keep timeRemaining/examEndTime in sync with what loadActiveAssessment already
        // computed from the real clock. We do NOT overwrite examEndTime with a stale
        // value here - it was already correctly restored above.
        if (!examEndTime && state.examEndTime) {
            examEndTime = state.examEndTime;
            timeRemaining = Math.max(0, Math.round((examEndTime - Date.now()) / 1000));
        }

        const orderMap = new Map();
        data.forEach(q => orderMap.set(q.id, q));

        questions = state.questionsOrder
            ? state.questionsOrder.map(id => orderMap.get(id)).filter(Boolean)
            : data;

        restored = true;
    } else {
        questions = shuffleArray(data).map(q => {
            if (q.question_type === "mcq" && Array.isArray(q.options)) {
                q.options = shuffleArray(q.options);
            }
            return q;
        });

        currentIndex = 0;
        studentAnswers = {};
    }

    renderQuestionWithProgress();
    saveExamState();

    reviewBtn.disabled = false;
    finalSubmitBtn.disabled = false;
}

// ================= RENDER QUESTIONS =================
function renderQuestion() {

    const q = questions[currentIndex];

    const hasArabicQuestion =
        /[\u0600-\u06FF]/.test(q.question_text);

    questionsContainer.innerHTML = `
        <div class="question-text"
             data-no-translate="true"
             dir="${hasArabicQuestion ? 'rtl' : 'ltr'}"
             style="
                text-align:${hasArabicQuestion ? 'right' : 'left'};
             ">
            ${currentIndex + 1}. ${q.question_text}
        </div>
    `;

    // ================= MCQ =================
    if (q.question_type === 'mcq') {

        (q.options || []).forEach(opt => {

            const hasArabicOption =
                /[\u0600-\u06FF]/.test(opt);

            const label = document.createElement('label');

            label.style.display = 'block';
            label.style.marginBottom = '10px';
            label.style.direction = hasArabicOption ? 'rtl' : 'ltr';
            label.style.textAlign = hasArabicOption ? 'right' : 'left';

            const input = document.createElement('input');

            input.type = 'radio';
            input.name = 'answer';
            input.value = opt;

            if (studentAnswers[q.id] === opt) {
                input.checked = true;
            }

            input.addEventListener('change', async () => {

                studentAnswers[q.id] = input.value;

                const { error } = await supabaseClient
                    .from('student_answers')
                    .upsert({
                        matric_number: matricNumber,
                        assessment_id: assessmentId,
                        question_id: q.id,
                        answer_text: input.value,
                        is_final: false
                    }, {
                        onConflict: 'matric_number,assessment_id,question_id'
                    });

                if (error) {
                    console.error("MCQ autosave error:", error);
                }

                saveExamState();
            });

            const span = document.createElement('span');

            span.textContent = ` ${opt}`;
            span.dataset.noTranslate = "true";

            label.appendChild(input);
            label.appendChild(span);

            questionsContainer.appendChild(label);
        });

    }

    // ================= TEXTAREA =================
    else {

        const textarea = document.createElement('textarea');

        textarea.value = studentAnswers[q.id] || '';
        textarea.placeholder = t('TYPE_ANSWER_HERE');

        textarea.rows = 4;
        textarea.style.width = '100%';

        questionsContainer.appendChild(textarea);

        let typingTimer;

        const typingDelay = 800;

        textarea.addEventListener('input', () => {

            clearTimeout(typingTimer);

            typingTimer = setTimeout(async () => {

                const answer = textarea.value.trim();

                studentAnswers[q.id] = answer;

                const { error } = await supabaseClient
                    .from('student_answers')
                    .upsert({
                        matric_number: matricNumber,
                        assessment_id: assessmentId,
                        question_id: q.id,
                        answer_text: answer,
                        is_final: false
                    }, {
                        onConflict: 'matric_number,assessment_id,question_id'
                    });

                if (error) {
                    console.error("Auto save error:", error);
                }

                saveExamState();

            }, typingDelay);

        });

    }
}
// ================= NAVIGATION ==============
function renderQuestionWithProgress() {
    renderQuestion();
    updateProgressBar();

    

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === questions.length - 1;
}

function updateProgressBar() {

    if (!questions || questions.length === 0) return;

    const percent = ((currentIndex + 1) / questions.length) * 100;

    progressBar.style.width = `${percent}%`;
}

prevBtn.addEventListener('click', async () => {

    await saveAnswer();

    if (currentIndex > 0) currentIndex--;

    renderQuestionWithProgress();

    saveExamState();
});

nextBtn.addEventListener('click', async () => {

    await saveAnswer();

    if (currentIndex < questions.length - 1) currentIndex++;

    renderQuestionWithProgress();

    saveExamState();
});

// ================= SAVE ANSWER =================
async function saveAnswer() {

    const q = questions[currentIndex];

    if (!q) return;

    let answer = '';

    if (q.question_type === 'mcq') {

        const selected = document.querySelector('input[name="answer"]:checked');

        answer = selected ? selected.value : '';

    } else {

        const textarea = document.querySelector('textarea');

        answer = textarea ? textarea.value.trim() : '';
    }

    studentAnswers[q.id] = answer;

    const { error } = await supabaseClient
        .from('student_answers')
        .upsert(
            {
                matric_number: matricNumber,
                assessment_id: assessmentId,
                question_id: q.id,
                answer_text: answer,
                is_final: false,
                updated_at: new Date().toISOString()
            },
            {
                onConflict: 'matric_number,assessment_id,question_id'
            }
        );

    if (error) {
        console.error("Save answer error:", error);
    }
}

function saveExamState() {

    const state = {
        assessmentId,
        currentIndex,
        timeRemaining,
        examEndTime,
        studentAnswers,
        questionsOrder: questions.map(q => q.id)
    };

    localStorage.setItem(
        `exam_state_${assessmentId}_${matricNumber}`,
        JSON.stringify(state)
    );
}

// ================= TIMER =================
function startTimer() {

    if (timerInterval) clearInterval(timerInterval);

    if (countdownBar) {

        countdownBar.classList.remove(
            'countdown-warning-mid',
            'countdown-warning-critical'
        );

        countdownBar.classList.add('countdown-safe');
    }

    if (timeWarning) {
        timeWarning.classList.add('hidden');
    }

    timerInterval = setInterval(() => {

        if (testEnded) {
            clearInterval(timerInterval);
            return;
        }

        // Always derive remaining time from the absolute end timestamp rather than
        // decrementing a counter. This keeps the displayed time accurate even if
        // the tab was backgrounded/throttled, and means a refresh just re-reads
        // the same examEndTime and shows the correct remaining time.
        timeRemaining = Math.max(0, Math.round((examEndTime - Date.now()) / 1000));

        if (timeRemaining <= 0) {

            clearInterval(timerInterval);

            // Don't block on alert() before submitting - alert() pauses all JS
            // execution until dismissed, so if the student has already walked
            // away (which is exactly the scenario we're guarding against) the
            // finalize/grade call would never even fire. Submit first, notify
            // after.
            finalSubmit('timeout');

            return;
        }

        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;

        timeDisplay.textContent =
            `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;

        if (countdownBar) {

            const percent = (timeRemaining / (durationMinutes * 60)) * 100;

            countdownBar.style.width = `${percent}%`;

            countdownBar.classList.remove(
                'countdown-safe',
                'countdown-warning-mid',
                'countdown-warning-critical'
            );

            if (timeRemaining > 300) {
                countdownBar.classList.add('countdown-safe');
            }
            else if (timeRemaining > 120) {
                countdownBar.classList.add('countdown-warning-mid');
            }
            else {
                countdownBar.classList.add('countdown-warning-critical');
            }
        }

        if (!warningShown && timeRemaining <= 120) {

            warningShown = true;

            if (timeWarning) {
                timeWarning.classList.remove('hidden');
            }
        }

        // Periodically persist state (every ~10s) so timeRemaining/examEndTime
        // stay backed up even if the student never clicks next/prev/types.
        if (timeRemaining % 10 === 0) {
            saveExamState();
        }

    }, 1000);
}

// ================= REVIEW MODAL =================
reviewBtn.addEventListener('click', async () => {

    await saveAnswer();

    reviewList.innerHTML = '';

    questions.forEach((q, idx) => {

        const li = document.createElement('li');

        const answerText =
    studentAnswers[q.id] || `[❌ Not answered]`;

        li.dataset.index = idx;
        li.style.cursor = 'pointer';

        li.innerHTML = `
          <div class="question">${idx + 1}. ${q.question_text}</div>
          <div class="answer">${answerText}</div>
        `;

        li.addEventListener('click', async () => {

            await saveAnswer();

            currentIndex = idx;

            renderQuestionWithProgress();

            reviewModal.style.display = 'none';
        });

        reviewList.appendChild(li);
    });

    reviewModal.style.display = 'flex';
});

window.addEventListener('click', e => {
    if (e.target === reviewModal) {
        reviewModal.style.display = 'none';
    }
});

// ================= UNANSWERED-QUESTIONS CONFIRM MODAL =================
// Built dynamically so no HTML changes are required. Returns a Promise that
// resolves to true if the student chose "Submit Anyway", false if they chose
// to go back and review unanswered questions.
function ensureUnansweredModal() {
    if (document.getElementById('unansweredConfirmModal')) return;

    const modal = document.createElement('div');
    modal.id = 'unansweredConfirmModal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.55);
        z-index: 99999;
        align-items: center;
        justify-content: center;
    `;

    modal.innerHTML = `
        <div style="
            background: var(--card-color, #fff);
            color: var(--text-color, #1a1a1a);
            padding: 28px;
            border-radius: 10px;
            max-width: 420px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 30px rgba(0,0,0,0.35);
            font-family: inherit;
            border: 1px solid var(--border-light, #d1fae5);
        ">
            <h3 style="margin: 0 0 12px; color: var(--text-color, #1a1a1a);">Unanswered Questions</h3>
            <p id="unansweredConfirmText" style="margin: 0 0 22px; color: var(--text-muted, #555);"></p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="cancelUnansweredBtn" style="
                    padding: 10px 18px;
                    border-radius: 6px;
                    border: 1px solid var(--border-light, #ccc);
                    background: var(--surface-color, #f5f5f5);
                    color: var(--text-color, #1a1a1a);
                    cursor: pointer;
                    font-size: 14px;
                ">Go Back</button>
                <button id="confirmUnansweredBtn" style="
                    padding: 10px 18px;
                    border-radius: 6px;
                    border: 1px solid var(--primary-dark, var(--primary, #153280));
                    background: var(--primary, #1816a3);
                    color: #fff;
                    cursor: pointer;
                    font-size: 14px;
                ">Submit Anyway</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function showUnansweredConfirmModal(unansweredCount) {
    ensureUnansweredModal();

    const modal = document.getElementById('unansweredConfirmModal');
    const text = document.getElementById('unansweredConfirmText');
    const cancelBtn = document.getElementById('cancelUnansweredBtn');
    const confirmBtn = document.getElementById('confirmUnansweredBtn');

    text.textContent = `You have ${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''}. You can submit anyway, or go back and finish them first.`;

    modal.style.display = 'flex';

    return new Promise(resolve => {
        function cleanup() {
            modal.style.display = 'none';
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
        }
        function onCancel() { cleanup(); resolve(false); }
        function onConfirm() { cleanup(); resolve(true); }

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
    });
}

// ================= FINAL SUBMIT =================
// reason: 'manual' (student clicked submit) or 'timeout' (clock hit zero).
// Both paths now call ONE combined RPC that flips is_final AND grades inside
// a single database transaction - so a grading failure rolls the is_final
// flip back too, instead of leaving answers stranded as "final" with no
// score and no way to retry. See finalize_and_grade_assessment().
async function finalSubmit(reason = 'manual') {

    if (testEnded) return;

    if (!finalSubmitBtn) return;

    const originalText = finalSubmitBtn.textContent;

    finalSubmitBtn.textContent = t('LOADING');
    finalSubmitBtn.disabled = true;

    try {

        await saveAnswer();

        if (reason === 'manual') {

            const unansweredQuestions = questions.filter(q => {
                const ans = studentAnswers[q.id];
                return !ans || ans.trim() === '';
            });

            if (unansweredQuestions.length > 0) {

                const proceedAnyway = await showUnansweredConfirmModal(unansweredQuestions.length);

                if (!proceedAnyway) {

                    reviewBtn.click();

                    finalSubmitBtn.textContent = originalText;
                    finalSubmitBtn.disabled = false;

                    return;
                }
                // proceedAnyway === true: fall through and submit despite gaps
            }
        }
        // reason === 'timeout': skip the unanswered-questions confirmation
        // entirely - there's no "go back" option once time is up, and no one
        // is necessarily even present to see the modal.

        const { error } = await supabaseClient.rpc(
            'finalize_and_grade_assessment',
            {
                p_student_matric: matricNumber,
                p_assessment_id: assessmentId,
                p_reason: reason
            }
        );

        if (error) {

            // is_final was NOT committed (the RPC's transaction rolled back),
            // so this is safely retryable - the student can hit submit again,
            // and if they walk away instead, the server-side sweep job will
            // pick this attempt up once its deadline passes.
            alert(t('Something went wrong submitting your exam. Please try again.'));

            console.error('finalize_and_grade_assessment error:', error);

            finalSubmitBtn.textContent = originalText;
            finalSubmitBtn.disabled = false;

            return;
        }

        testEnded = true;

        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        localStorage.removeItem(
            `exam_state_${assessmentId}_${matricNumber}`
        );

        reviewModal.style.display = 'none';

        endTestSession();

    } finally {

        finalSubmitBtn.textContent = originalText;
        finalSubmitBtn.disabled = false;
    }
}

finalSubmitBtn.addEventListener('click', finalSubmit);

function endTestSession() {

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    prevBtn.disabled = true;
    nextBtn.disabled = true;
    reviewBtn.disabled = true;
    finalSubmitBtn.disabled = true;

    const completionModal = document.getElementById('completionModal');

    completionModal.style.display = 'flex';
}
console.log("HEADER UPDATED:", examTitle.textContent);
setInterval(() => {
  console.log("TITLE:", examTitle.textContent);
}, 2000);
// ================= INIT =================
document.addEventListener('DOMContentLoaded', async () => {

    await loadActiveAssessment();

    await loadQuestions    ();

});

document.getElementById('goDashboardBtn').onclick = () => {
    window.location.href = "students-dashboard.html";
};

document.getElementById('closeReviewModal').addEventListener('click', () => {
    reviewModal.style.display = 'none';
});

document.getElementById('backToExamBtn').addEventListener('click', () => {
    reviewModal.style.display = 'none';
});

document.getElementById('logoutBtn').onclick = () => {

    sessionStorage.clear();

    window.location.href = "login.html";
};