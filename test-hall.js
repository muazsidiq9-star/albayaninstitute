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

    return false;
}

    return true;
}    

async function loadActiveAssessment() {
    const hasPaid = await checkFees();
    if (!hasPaid) return;

    const studentLevel = currentStudent.level;

    let { data, error } = await supabaseClient
        .from('assessments')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'active')
        .eq('level_arabic', studentLevel)
        .limit(1);

    console.log(currentStudent);

    if (!data || data.length === 0) {
    examTitle.textContent = "No active assessment";
    examMessage.textContent = "Please check back later";
    return;
}

    const assessment = data[0];
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
        const savedState = localStorage.getItem(
            `exam_state_${assessmentId}_${matricNumber}`
        );

        // ===== TIMER FIX =====
        // We no longer trust a stored "secondsRemaining" counter, because it is
        // only ever written when the student clicks next/prev or types an answer.
        // Instead we store/restore an absolute end timestamp (examEndTime) and
        // always derive timeRemaining = examEndTime - now. This survives
        // refreshes, closed tabs, throttled background tabs, etc.
        if (savedState) {
            const state = JSON.parse(savedState);

            if (state.examEndTime) {
                examEndTime = state.examEndTime;
                timeRemaining = Math.max(0, Math.round((examEndTime - Date.now()) / 1000));
            } else {
                // Backward compatibility with any state saved before this fix
                timeRemaining = state.timeRemaining || durationMinutes * 60;
                examEndTime = Date.now() + timeRemaining * 1000;
            }
        } else {
            timeRemaining = durationMinutes * 60;
            examEndTime = Date.now() + timeRemaining * 1000;
        }

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

            alert("Time is up");

            finalSubmit();

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
async function finalSubmit() {

    if (testEnded) return;

    if (!finalSubmitBtn) return;

    const originalText = finalSubmitBtn.textContent;

    finalSubmitBtn.textContent = t('LOADING');
    finalSubmitBtn.disabled = true;

    try {

        await saveAnswer();

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

        const { error: finalizeError } = await supabaseClient
            .from('student_answers')
            .update({ is_final: true })
            .eq('matric_number', matricNumber)
            .eq('assessment_id', assessmentId);

        if (finalizeError) {
            alert('Submission error');
            console.error(finalizeError);
            finalSubmitBtn.textContent = originalText;
            finalSubmitBtn.disabled = false;
            return;
        }

        const { data, error } = await supabaseClient.rpc(
            'grade_student_assessment',
            {
                p_student_matric: matricNumber,
                p_assessment_id: assessmentId
            }
        );

        if (error) {

            alert('Grading error');

            console.error(error);

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