const loginForm = document.querySelector('#loginForm');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const rememberInput = document.querySelector('#remember');
const passwordToggle = document.querySelector('#passwordToggle');
const submitButton = document.querySelector('#submitButton');
const formView = document.querySelector('#formView');
const successView = document.querySelector('#successView');
const successEmail = document.querySelector('#successEmail');
const toast = document.querySelector('#toast');
const languageToggle = document.querySelector('#languageToggle');
const languageToggleText = document.querySelector('#languageToggleText');
const loginPage = document.querySelector('#loginPage');
const workspaceView = document.querySelector('#workspaceView');
const logoutButton = document.querySelector('#logoutButton');
const createProjectButton = document.querySelector('#createProjectButton');
const projectModal = document.querySelector('#projectModal');
const projectForm = document.querySelector('#projectForm');
const wizardBack = document.querySelector('#wizardBack');
const wizardNext = document.querySelector('#wizardNext');
const wizardSubmit = document.querySelector('#wizardSubmit');
const stepIndicator = document.querySelector('#stepIndicator');
const progressBar = document.querySelector('#progressBar');
const projectListSection = document.querySelector('#projectListSection');
const projectList = document.querySelector('#projectList');
const activeProjectCount = document.querySelector('#activeProjectCount');
const activeProjectsButton = document.querySelector('#activeProjectsButton');
const activeProjectsView = document.querySelector('#activeProjectsView');
const backFromActiveProjects = document.querySelector('#backFromActiveProjects');
const activeProjectsEmpty = document.querySelector('#activeProjectsEmpty');
const projectTableWrap = document.querySelector('#projectTableWrap');
const activeProjectsTableBody = document.querySelector('#activeProjectsTableBody');
const finishedProjectsButton = document.querySelector('#finishedProjectsButton');
const finishedProjectCount = document.querySelector('#finishedProjectCount');
const priorityFilter = document.querySelector('#priorityFilter');
const priorityFilterButtons = document.querySelectorAll('.priority-filter-button');
const cegFilterInput = document.querySelector('#cegFilterInput');

const projectFieldOrder = [
  'projectPriority', 'ceg', 'requestor', 'bu', 'requestDate', 'budget',
  'description', 'supplierName', 'supplierType', 'procurementStrategy',
  'procurementStatus', 'ecForm', 'prApprovedDate', 'poReleaseDate',
  'estimatedClosingDate'
];
const projectFormGrid = document.querySelector('.project-form-grid');
projectFieldOrder.forEach((id) => {
  const field = document.querySelector(`#${id}`)?.closest('.project-field');
  if (field) projectFormGrid.append(field);
});

const EMAIL_KEY = 'xingyu-remembered-email';
const LANGUAGE_KEY = 'cari-preferred-language';
const PROJECTS_KEY = 'cari-procurement-projects';
const PROJECT_IMPORT_KEY = 'cari-project-import-id';
let toastTimer;
let currentLanguage = 'en';

const translations = {
  en: {
    pageTitle: 'CARI Procurement Project Tracking',
    pageDescription: 'CARI Procurement Project Tracking login page',
    brandName: 'CARI Procurement Project Tracking',
    tagline: 'SMARTER PROCUREMENT, CLEARER PROGRESS',
    heroTitle: 'CARI Procurement<br>Project Tracking',
    heroCopy: 'Sign in to monitor procurement activities, project milestones, and delivery progress.',
    trustCopy: 'One place for procurement project visibility',
    loginTitle: 'CARI Procurement<br>Project Tracking',
    emailLabel: 'Email address',
    passwordLabel: 'Password',
    forgotPassword: 'Forgot password?',
    rememberEmail: 'Remember my email',
    signIn: 'Sign in',
    signingIn: 'Signing in',
    successTitle: 'Sign-in successful',
    welcomeBack: 'Welcome back,',
    workspaceReady: 'Your project workspace is ready.',
    backToSignIn: 'Back to sign in',
    legal: 'By signing in, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.',
    emailRequired: 'Please enter your email address',
    emailInvalid: 'Incorrect email or password',
    passwordRequired: 'Please enter your password',
    passwordShort: 'Incorrect email or password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    forgotToast: 'Please contact the administrator to reset your password.',
    workspaceBrand: 'CARI Procurement Project Tracking',
    workspaceEyebrow: 'PROJECT WORKSPACE',
    workspaceTitle: 'Welcome to CARI Procurement Project Tracking',
    activeProjects: 'Active Project',
    signOut: 'Sign out',
    createProject: 'Create New Project',
    recentProjects: 'Recent projects',
    newProjectTitle: 'Create a new project',
    basicsTitle: 'Let’s start with the basics',
    basicsCopy: 'Tell us how this procurement project should be identified.',
    projectName: 'Project name',
    projectNamePlaceholder: 'e.g. Office equipment renewal',
    department: 'Department',
    departmentPlaceholder: 'e.g. Operations',
    projectOwner: 'Project owner',
    ownerPlaceholder: 'Full name',
    procurementTitle: 'Procurement details',
    procurementCopy: 'Add the category, estimated value, and priority.',
    category: 'Procurement category',
    selectCategory: 'Select a category',
    goods: 'Goods', services: 'Services', works: 'Works', consulting: 'Consulting',
    estimatedBudget: 'Estimated budget',
    budgetPlaceholder: '0.00',
    priority: 'Priority',
    normal: 'Normal', high: 'High', urgent: 'Urgent',
    timelineTitle: 'Timeline and notes',
    timelineCopy: 'Set the target dates and add any helpful context.',
    startDate: 'Start date',
    targetDate: 'Target completion',
    notes: 'Project notes',
    notesPlaceholder: 'Add objectives, requirements, or other context (optional)',
    back: 'Back', continue: 'Continue',
    stepOf: 'STEP {current} OF {total}',
    requiredField: 'This field is required',
    invalidBudget: 'Enter a budget greater than or equal to 0',
    projectCreated: 'Project created successfully.',
    ownerPrefix: 'Owner', budgetPrefix: 'Budget',
    newProjectEyebrow: 'NEW PROCUREMENT PROJECT',
    newProjectCopy: 'Complete the information below to create a procurement project.',
    cancel: 'Cancel',
    selectOption: 'Select an option',
    viewProjects: 'View projects →',
    backToOverview: 'Back to overview',
    projectPortfolio: 'PROJECT PORTFOLIO',
    activeProjectsTitle: 'Active Projects',
    noProjectsTitle: 'No active projects yet',
    noProjectsCopy: 'Create a project from the overview page and it will appear here.',
    finishedProjects: 'Finished Project',
    finishedProjectsTitle: 'Finished Projects',
    noFinishedTitle: 'No finished projects yet',
    noFinishedCopy: 'Projects will move here automatically when their closing date is reached.',
    filterByPriority: 'Filter by priority',
    filterByCeg: 'CEG',
    cegFilterPlaceholder: 'Search CEG',
    filterAll: 'All',
    medium: 'Medium',
    noFilteredProjectsTitle: 'No matching projects',
    noFilteredProjectsCopy: 'Try selecting another priority to see more projects.',
    editProjectTitle: 'Edit project',
    editProjectEyebrow: 'UPDATE PROCUREMENT PROJECT',
    updateProject: 'Update Project',
    projectUpdated: 'Project updated successfully.',
    editProjectAria: 'Edit project',
    switchLanguage: 'Switch to Chinese',
    languageButton: '中文'
  },
  zh: {
    pageTitle: 'CARI 采购项目跟踪',
    pageDescription: 'CARI 采购项目跟踪登录页面',
    brandName: 'CARI 采购项目跟踪',
    tagline: '更智能的采购，更清晰的进度',
    heroTitle: 'CARI 采购<br>项目跟踪',
    heroCopy: '登录以查看采购活动、项目里程碑和交付进度。',
    trustCopy: '集中掌握采购项目进展',
    loginTitle: 'CARI 采购<br>项目跟踪',
    emailLabel: '邮箱地址',
    passwordLabel: '密码',
    forgotPassword: '忘记密码？',
    rememberEmail: '记住我的邮箱',
    signIn: '登录',
    signingIn: '正在登录',
    successTitle: '登录成功',
    welcomeBack: '欢迎回来，',
    workspaceReady: '你的项目工作空间已准备就绪。',
    backToSignIn: '返回登录',
    legal: '登录即表示你同意我们的<a href="#">服务条款</a>和<a href="#">隐私政策</a>。',
    emailRequired: '请输入邮箱地址',
    emailInvalid: '邮箱或密码错误',
    passwordRequired: '请输入密码',
    passwordShort: '邮箱或密码错误',
    showPassword: '显示密码',
    hidePassword: '隐藏密码',
    forgotToast: '请联系管理员重置密码。',
    workspaceBrand: 'CARI 采购项目跟踪',
    workspaceEyebrow: '项目工作空间',
    workspaceTitle: '欢迎进入 CARI 采购项目跟踪',
    activeProjects: '进行中的项目',
    signOut: '退出登录',
    createProject: '建立新项目',
    recentProjects: '最近项目',
    newProjectTitle: '建立新项目',
    basicsTitle: '先填写基本信息',
    basicsCopy: '请说明这个采购项目的名称和负责人。',
    projectName: '项目名称',
    projectNamePlaceholder: '例如：办公设备更新',
    department: '所属部门',
    departmentPlaceholder: '例如：运营部',
    projectOwner: '项目负责人',
    ownerPlaceholder: '姓名',
    procurementTitle: '采购信息',
    procurementCopy: '请选择采购类别，并填写预估预算和优先级。',
    category: '采购类别',
    selectCategory: '请选择类别',
    goods: '货物', services: '服务', works: '工程', consulting: '咨询',
    estimatedBudget: '预估预算',
    budgetPlaceholder: '0.00',
    priority: '优先级',
    normal: '普通', high: '高', urgent: '紧急',
    timelineTitle: '时间与说明',
    timelineCopy: '设置目标日期，并补充项目背景。',
    startDate: '开始日期',
    targetDate: '目标完成日期',
    notes: '项目说明',
    notesPlaceholder: '填写目标、要求或其他背景（选填）',
    back: '上一步', continue: '继续',
    stepOf: '第 {current} 步，共 {total} 步',
    requiredField: '此项为必填项',
    invalidBudget: '请输入大于或等于 0 的预算',
    projectCreated: '项目建立成功。',
    ownerPrefix: '负责人', budgetPrefix: '预算',
    newProjectEyebrow: '新采购项目',
    newProjectCopy: '请填写以下信息以建立采购项目。',
    cancel: '取消',
    selectOption: '请选择',
    viewProjects: '查看项目 →',
    backToOverview: '返回总览',
    projectPortfolio: '项目汇总',
    activeProjectsTitle: '进行中的项目',
    noProjectsTitle: '暂无进行中的项目',
    noProjectsCopy: '请先在总览页面建立项目，项目随后会显示在这里。',
    finishedProjects: '已完成项目',
    finishedProjectsTitle: '已完成项目',
    noFinishedTitle: '暂无已完成项目',
    noFinishedCopy: '项目到达预计结束日期后会自动转移到这里。',
    editProjectTitle: '编辑项目',
    editProjectEyebrow: '更新采购项目',
    updateProject: '更新项目',
    projectUpdated: '项目更新成功。',
    editProjectAria: '编辑项目',
    switchLanguage: '切换为英文',
    filterByPriority: '\u6309\u4f18\u5148\u7ea7\u7b5b\u9009',
    filterByCeg: 'CEG',
    cegFilterPlaceholder: '\u641c\u7d22 CEG',
    filterAll: '\u5168\u90e8',
    medium: '\u4e2d',
    noFilteredProjectsTitle: '\u6ca1\u6709\u5339\u914d\u7684\u9879\u76ee',
    noFilteredProjectsCopy: '\u8bf7\u9009\u62e9\u5176\u4ed6\u4f18\u5148\u7ea7\u67e5\u770b\u9879\u76ee\u3002',
    languageButton: 'English'
  }
};

function t(key) {
  return translations[currentLanguage][key];
}

function applyLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = t('pageTitle');
  document.querySelector('meta[name="description"]').content = t('pageDescription');
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  languageToggleText.textContent = t('languageButton');
  languageToggle.setAttribute('aria-label', t('switchLanguage'));
  passwordToggle.setAttribute('aria-label', passwordInput.type === 'password' ? t('showPassword') : t('hidePassword'));

  if (emailInput.getAttribute('aria-invalid') === 'true') validateEmail();
  if (passwordInput.getAttribute('aria-invalid') === 'true') validatePassword();
  updateWizardUI();
  renderProjects();
  updateProjectFormMode();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function setError(input, message) {
  const group = input.closest('.field-group');
  const error = group.querySelector('.field-error');
  group.classList.toggle('invalid', Boolean(message));
  input.setAttribute('aria-invalid', String(Boolean(message)));
  error.textContent = message;
}

function validateEmail() {
  const value = emailInput.value.trim();
  if (!value) {
    setError(emailInput, t('emailRequired'));
    return false;
  }
  setError(emailInput, '');
  return true;
}

function validatePassword() {
  if (!passwordInput.value) {
    setError(passwordInput, t('passwordRequired'));
    return false;
  }
  setError(passwordInput, '');
  return true;
}

emailInput.addEventListener('blur', validateEmail);
passwordInput.addEventListener('blur', validatePassword);
emailInput.addEventListener('input', () => {
  if (emailInput.getAttribute('aria-invalid') === 'true') validateEmail();
});
passwordInput.addEventListener('input', () => {
  if (passwordInput.getAttribute('aria-invalid') === 'true') validatePassword();
});

passwordToggle.addEventListener('click', () => {
  const shouldShow = passwordInput.type === 'password';
  passwordInput.type = shouldShow ? 'text' : 'password';
  passwordToggle.setAttribute('aria-pressed', String(shouldShow));
  passwordToggle.setAttribute('aria-label', shouldShow ? t('hidePassword') : t('showPassword'));
  passwordInput.focus();
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const emailValid = validateEmail();
  const passwordValid = validatePassword();

  if (!emailValid || !passwordValid) {
    (emailValid ? passwordInput : emailInput).focus();
    return;
  }

  submitButton.classList.add('loading');
  submitButton.disabled = true;
  submitButton.querySelector('.button-label').textContent = t('signingIn');

  try {
    await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value })
    });
    try {
      if (rememberInput.checked) {
        localStorage.setItem(EMAIL_KEY, emailInput.value.trim());
      } else {
        localStorage.removeItem(EMAIL_KEY);
      }
    } catch {
      // Remembering the email is optional.
    }
    await enterWorkspace();
  } catch (error) {
    setError(passwordInput, error.status === 401 ? t('emailInvalid') : error.message);
    passwordInput.focus();
  } finally {
    submitButton.classList.remove('loading');
    submitButton.disabled = false;
    submitButton.querySelector('.button-label').textContent = t('signIn');
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // The local view still signs out if the session already expired.
  }
  projects.splice(0);
  workspaceView.hidden = true;
  activeProjectsView.hidden = true;
  loginPage.hidden = false;
  passwordInput.value = '';
  setError(passwordInput, '');
  passwordInput.focus();
});

let currentStep = 1;
const totalSteps = 1;
const projects = [];
let editingProjectId = null;
let projectReturnView = 'workspace';
let portfolioMode = 'active';
let portfolioSourceButton = activeProjectsButton;
let priorityFilterValue = 'all';
let cegFilterValue = '';

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function importLegacyProjects() {
  let savedProjects;
  try {
    savedProjects = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
  } catch {
    return;
  }
  if (!Array.isArray(savedProjects) || savedProjects.length === 0) return;
  let importId = localStorage.getItem(PROJECT_IMPORT_KEY);
  if (!importId) {
    importId = crypto.randomUUID();
    localStorage.setItem(PROJECT_IMPORT_KEY, importId);
  }
  await apiRequest('/api/projects/import', {
    method: 'POST',
    body: JSON.stringify({ importId, projects: savedProjects })
  });
  localStorage.removeItem(PROJECTS_KEY);
  localStorage.removeItem(PROJECT_IMPORT_KEY);
}

async function loadProjectsFromServer() {
  const response = await apiRequest('/api/projects');
  projects.splice(0, projects.length, ...response.projects);
  renderProjects();
}

async function enterWorkspace() {
  try {
    await importLegacyProjects();
  } catch (error) {
    showToast(`Local project import failed: ${error.message}`);
  }
  await loadProjectsFromServer();
  loginPage.hidden = true;
  workspaceView.hidden = false;
  languageToggle.focus();
}

function localDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isFinishedProject(project) {
  return Boolean(project.estimatedClosingDate) && project.estimatedClosingDate <= localDateString();
}

function updateWizardUI() {
  wizardBack.hidden = false;
  wizardNext.hidden = true;
  wizardSubmit.hidden = false;
}

function openProjectWizard() {
  editingProjectId = null;
  projectReturnView = 'workspace';
  currentStep = 1;
  projectForm.reset();
  projectForm.querySelectorAll('.project-field').forEach((field) => field.classList.remove('invalid'));
  projectForm.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
  updateWizardUI();
  updateProjectFormMode();
  workspaceView.hidden = true;
  projectModal.hidden = false;
  window.scrollTo(0, 0);
  window.setTimeout(() => document.querySelector('#projectPriority').focus(), 0);
}

function closeProjectWizard() {
  projectModal.hidden = true;
  if (projectReturnView === 'active') {
    activeProjectsView.hidden = false;
  } else {
    workspaceView.hidden = false;
  }
  window.scrollTo(0, 0);
  (projectReturnView === 'active' ? backFromActiveProjects : createProjectButton).focus();
}

function updateProjectFormMode() {
  const editing = editingProjectId !== null;
  document.querySelector('#projectModalTitle').textContent = editing ? t('editProjectTitle') : t('newProjectTitle');
  document.querySelector('.project-form-page > .eyebrow').textContent = editing ? t('editProjectEyebrow') : t('newProjectEyebrow');
  wizardSubmit.textContent = editing ? t('updateProject') : t('createProject');
}

function openProjectEditor(id) {
  const project = projects.find((item) => item.id === id);
  if (!project) return;
  editingProjectId = id;
  projectReturnView = 'active';
  projectForm.reset();
  projectForm.querySelectorAll('.project-field').forEach((field) => field.classList.remove('invalid'));
  projectForm.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
  Object.entries(project).forEach(([key, value]) => {
    const field = projectForm.elements.namedItem(key);
    if (field) field.value = value;
  });
  updateWizardUI();
  updateProjectFormMode();
  activeProjectsView.hidden = true;
  projectModal.hidden = false;
  window.scrollTo(0, 0);
  window.setTimeout(() => document.querySelector('#projectPriority').focus(), 0);
}

function setProjectError(input, message) {
  const field = input.closest('.project-field');
  field.classList.toggle('invalid', Boolean(message));
  input.setAttribute('aria-invalid', String(Boolean(message)));
  field.querySelector('.field-error').textContent = message;
}

function validateCurrentStep() {
  let valid = true;
  projectForm.querySelectorAll('input, select, textarea').forEach((input) => setProjectError(input, ''));

  const budget = document.querySelector('#budget');
  if (budget.value && Number(budget.value) < 0) {
    setProjectError(budget, t('invalidBudget'));
    valid = false;
  }

  if (!valid) projectForm.querySelector('[aria-invalid="true"]')?.focus();
  return valid;
}

function localizedOption(value) {
  const keys = { Goods: 'goods', Services: 'services', Works: 'works', Consulting: 'consulting', Normal: 'normal', High: 'high', Urgent: 'urgent' };
  return t(keys[value] || value);
}

function renderProjects() {
  const activeCount = projects.filter((project) => !isFinishedProject(project)).length;
  const finishedCount = projects.length - activeCount;
  activeProjectCount.textContent = activeCount;
  finishedProjectCount.textContent = finishedCount;
  projectListSection.hidden = projects.length === 0;
  projectList.replaceChildren();

  projects.forEach((project) => {
    const card = document.createElement('article');
    card.className = 'project-row';
    const main = document.createElement('div');
    const title = document.createElement('h3');
    const meta = document.createElement('p');
    const aside = document.createElement('div');
    const badge = document.createElement('span');
    const date = document.createElement('time');

    const recentPriority = document.createElement('span');
    if (project.projectPriority) {
      recentPriority.className = `table-priority table-priority-${project.projectPriority.toLowerCase()}`;
      recentPriority.textContent = project.projectPriority;
      title.append(recentPriority);
    }
    title.append(document.createTextNode(project.bu || 'Untitled project'));
    const recentBudget = project.budget === '' ? '—' : `$${Number(project.budget).toLocaleString()}`;
    meta.textContent = `CEG: ${project.ceg || '—'} · Requestor: ${project.requestor || '—'} · Budget: ${recentBudget}`;
    badge.className = 'priority-badge';
    badge.textContent = project.procurementStatus;
    date.dateTime = project.estimatedClosingDate;
    date.textContent = project.estimatedClosingDate;
    main.append(title, meta);
    aside.append(badge, date);
    card.append(main, aside);
    projectList.append(card);
  });
  renderActiveProjectsTable();
}

function renderActiveProjectsTable() {
  const priorityRank = { High: 0, Medium: 1, Normal: 2 };
  const visibleProjects = projects
    .filter((project) => portfolioMode === 'finished' ? isFinishedProject(project) : !isFinishedProject(project))
    .filter((project) => portfolioMode === 'finished' || priorityFilterValue === 'all' || project.projectPriority === priorityFilterValue)
    .filter((project) => portfolioMode === 'finished' || !cegFilterValue || project.ceg.toLowerCase().includes(cegFilterValue))
    .sort((first, second) => (priorityRank[first.projectPriority] ?? 3) - (priorityRank[second.projectPriority] ?? 3));
  const hasProjects = visibleProjects.length > 0;
  activeProjectsEmpty.hidden = hasProjects;
  projectTableWrap.hidden = !hasProjects;
  activeProjectsTableBody.replaceChildren();
  updatePortfolioLabels();

  visibleProjects.forEach((project) => {
    const row = document.createElement('tr');
    const values = [
      project.projectPriority,
      project.ceg,
      project.requestor,
      project.bu,
      project.requestDate,
      project.budget === '' ? '—' : `$${Number(project.budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      project.description,
      project.supplierName,
      project.supplierType,
      project.procurementStrategy,
      project.procurementStatus,
      project.ecForm,
      project.prApprovedDate,
      project.poReleaseDate,
      project.estimatedClosingDate
    ];

    values.forEach((value, index) => {
      const cell = document.createElement('td');
      if (index === 10 && value) {
        const status = document.createElement('span');
        status.className = 'table-status';
        status.textContent = value;
        cell.append(status);
      } else if (index === 0 && value) {
        const priority = document.createElement('span');
        priority.className = `table-priority table-priority-${value.toLowerCase()}`;
        priority.textContent = value;
        cell.append(priority);
      } else {
        cell.textContent = value || '—';
      }
      row.append(cell);
    });
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `${t('editProjectAria')}: ${project.ceg}`);
    row.addEventListener('click', () => openProjectEditor(project.id));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openProjectEditor(project.id);
      }
    });
    activeProjectsTableBody.append(row);
  });
}

function updatePortfolioLabels() {
  const finished = portfolioMode === 'finished';
  const filtered = !finished && (priorityFilterValue !== 'all' || cegFilterValue !== '');
  document.querySelector('#activeProjectsTitle').textContent = t(finished ? 'finishedProjectsTitle' : 'activeProjectsTitle');
  activeProjectsEmpty.querySelector('h2').textContent = t(finished ? 'noFinishedTitle' : filtered ? 'noFilteredProjectsTitle' : 'noProjectsTitle');
  activeProjectsEmpty.querySelector('p').textContent = t(finished ? 'noFinishedCopy' : filtered ? 'noFilteredProjectsCopy' : 'noProjectsCopy');
  priorityFilter.hidden = finished;
}

function openPortfolio(mode, sourceButton) {
  portfolioMode = mode;
  priorityFilterValue = 'all';
  cegFilterValue = '';
  cegFilterInput.value = '';
  priorityFilterButtons.forEach((button) => {
    const selected = button.dataset.priority === 'all';
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  portfolioSourceButton = sourceButton;
  workspaceView.hidden = true;
  activeProjectsView.hidden = false;
  renderActiveProjectsTable();
  window.scrollTo(0, 0);
  backFromActiveProjects.focus();
}

activeProjectsButton.addEventListener('click', () => {
  openPortfolio('active', activeProjectsButton);
});

finishedProjectsButton.addEventListener('click', () => {
  openPortfolio('finished', finishedProjectsButton);
});

priorityFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    priorityFilterValue = button.dataset.priority;
    priorityFilterButtons.forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle('active', selected);
      filterButton.setAttribute('aria-pressed', String(selected));
    });
    renderActiveProjectsTable();
  });
});

cegFilterInput.addEventListener('input', () => {
  cegFilterValue = cegFilterInput.value.trim().toLowerCase();
  renderActiveProjectsTable();
});

backFromActiveProjects.addEventListener('click', () => {
  activeProjectsView.hidden = true;
  workspaceView.hidden = false;
  window.scrollTo(0, 0);
  portfolioSourceButton.focus();
});

createProjectButton.addEventListener('click', openProjectWizard);
wizardNext.addEventListener('click', () => {
  // Reserved for future multi-step forms.
});
wizardBack.addEventListener('click', closeProjectWizard);
projectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateCurrentStep()) return;
  const data = new FormData(projectForm);
  const projectData = {
    projectPriority: data.get('projectPriority'),
    ceg: data.get('ceg').trim(),
    requestor: data.get('requestor').trim(),
    bu: data.get('bu').trim(),
    requestDate: data.get('requestDate'),
    budget: data.get('budget'),
    description: data.get('description').trim(),
    supplierName: data.get('supplierName').trim(),
    supplierType: data.get('supplierType'),
    procurementStrategy: data.get('procurementStrategy'),
    procurementStatus: data.get('procurementStatus'),
    ecForm: data.get('ecForm'),
    prApprovedDate: data.get('prApprovedDate'),
    poReleaseDate: data.get('poReleaseDate'),
    estimatedClosingDate: data.get('estimatedClosingDate')
  };
  const wasEditing = editingProjectId !== null;
  wizardSubmit.disabled = true;
  try {
    const response = await apiRequest(wasEditing ? `/api/projects/${editingProjectId}` : '/api/projects', {
      method: wasEditing ? 'PUT' : 'POST',
      body: JSON.stringify(projectData)
    });
    if (wasEditing) {
      const projectIndex = projects.findIndex((project) => project.id === editingProjectId);
      if (projectIndex >= 0) projects[projectIndex] = response.project;
    } else {
      projects.unshift(response.project);
    }
    renderProjects();
    closeProjectWizard();
    showToast(t(wasEditing ? 'projectUpdated' : 'projectCreated'));
  } catch (error) {
    showToast(error.message);
  } finally {
    wizardSubmit.disabled = false;
    updateProjectFormMode();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !projectModal.hidden) closeProjectWizard();
});

document.querySelector('#backButton').addEventListener('click', () => {
  successView.hidden = true;
  formView.hidden = false;
  passwordInput.value = '';
  setError(passwordInput, '');
  passwordInput.focus();
});

document.querySelector('#forgotButton').addEventListener('click', () => {
  showToast(t('forgotToast'));
});

languageToggle.addEventListener('click', () => {
  const nextLanguage = currentLanguage === 'en' ? 'zh' : 'en';
  applyLanguage(nextLanguage);
  try {
    localStorage.setItem(LANGUAGE_KEY, nextLanguage);
  } catch {
    // Language switching still works when local storage is unavailable.
  }
});

try {
  const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
  if (savedLanguage === 'zh' || savedLanguage === 'en') currentLanguage = savedLanguage;
  const rememberedEmail = localStorage.getItem(EMAIL_KEY);
  if (rememberedEmail) {
    emailInput.value = rememberedEmail;
    rememberInput.checked = true;
  }
} catch {
  // The page remains usable when local storage is disabled.
}

async function initializeApplication() {
  applyLanguage(currentLanguage);
  try {
    await apiRequest('/api/auth/me');
    await enterWorkspace();
  } catch (error) {
    if (error.status && error.status !== 401) showToast(error.message);
    loginPage.hidden = false;
    workspaceView.hidden = true;
    activeProjectsView.hidden = true;
  }
}

initializeApplication();
