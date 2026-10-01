const rolePermissions = {
    Administrator: ['admin', 'content', 'users', 'reports'],
    Editor: ['content'],
    Reporter: ['reports']
};

const elements = {
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    contentForm: document.getElementById('content-form'),
    siteCopyForm: document.getElementById('site-copy-form'),
    userForm: document.getElementById('user-form'),
    userList: document.getElementById('user-list'),
    updateList: document.getElementById('managed-updates'),
    adminUpdates: document.getElementById('admin-updates-feed'),
    donations: document.getElementById('report-donations'),
    dashboardDonations: document.getElementById('dashboard-donations')
};

let signedInUser;
let siteContentFields = [];

async function request(path, options = {}) {
    const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers
        }
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
}

function makeCell(text, className = 'p-sm') {
    const cell = document.createElement('td');
    cell.className = className;
    cell.textContent = text;
    return cell;
}

function makeButton(label, onClick, className = 'rounded border border-outline-variant px-2 py-1 text-sm hover:bg-surface-container') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}

function showStatus(id, message, isError = false) {
    const status = document.getElementById(id);
    status.textContent = message;
    status.classList.toggle('text-error', isError);
}

function showWorkspace(user) {
    signedInUser = user;
    elements.adminUpdates.replaceChildren();
    elements.dashboardDonations.replaceChildren();
    elements.donations.replaceChildren();
    elements.userList.replaceChildren();
    elements.updateList.replaceChildren();
    document.body.classList.add('authenticated');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('current-user-name').textContent = user.name;
    document.getElementById('current-user-role').textContent = user.role;

    const allowed = rolePermissions[user.role] || [];
    document.querySelectorAll('[data-role-section]').forEach((section) => {
        section.classList.toggle('hidden', !allowed.includes(section.dataset.roleSection));
    });
    loadRoleData().catch((error) => showStatus('report-status', error.message, true));
}

async function loadUpdates() {
    const { updates } = await request('/api/updates');
    elements.updateList.replaceChildren();
    elements.adminUpdates.replaceChildren();

    if (!updates.length) {
        elements.updateList.textContent = 'No published updates yet.';
        elements.adminUpdates.textContent = 'No program updates yet.';
        return;
    }

    updates.forEach((update) => {
        const row = document.createElement('article');
        row.className = 'flex flex-wrap items-start justify-between gap-md py-md';
        const copy = document.createElement('div');
        copy.className = 'min-w-0 flex-1';
        const title = document.createElement('h3');
        title.className = 'font-title-lg text-title-lg text-primary';
        title.textContent = update.title;
        const summary = document.createElement('p');
        summary.className = 'font-body-md text-body-md text-on-surface-variant';
        summary.textContent = `${update.category} · ${update.summary}`;
        const byline = document.createElement('p');
        byline.className = 'text-xs text-on-surface-variant';
        byline.textContent = `${update.author} · ${new Date(update.createdAt + 'Z').toLocaleDateString()}`;
        copy.append(title, summary, byline);
        const actions = document.createElement('div');
        actions.className = 'flex gap-2';
        actions.append(
            makeButton('Edit', () => beginEdit(update)),
            makeButton('Delete', () => deleteUpdate(update.id), 'rounded border border-error px-2 py-1 text-sm text-error hover:bg-error-container')
        );
        if (signedInUser.role === 'Administrator' || signedInUser.role === 'Editor') row.append(copy, actions);
        else row.append(copy);
        elements.updateList.append(row);

        const feedItem = document.createElement('article');
        feedItem.className = 'border-b border-outline-variant/30 pb-md';
        const category = document.createElement('span');
        category.className = 'inline-block rounded bg-secondary-fixed/20 px-2 py-1 text-xs font-bold text-on-secondary-container';
        category.textContent = update.category;
        const feedTitle = document.createElement('h4');
        feedTitle.className = 'mt-2 font-label-md text-label-md font-bold text-primary';
        feedTitle.textContent = update.title;
        const feedSummary = document.createElement('p');
        feedSummary.className = 'mt-1 text-sm text-on-surface-variant';
        feedSummary.textContent = update.summary;
        const feedDate = document.createElement('p');
        feedDate.className = 'mt-2 text-xs text-outline';
        feedDate.textContent = new Date(update.createdAt + 'Z').toLocaleDateString();
        feedItem.append(category, feedTitle, feedSummary, feedDate);
        elements.adminUpdates.append(feedItem);
    });
}

async function loadSiteCopy() {
    const { fields } = await request('/api/site-content');
    siteContentFields = fields;
    const select = elements.siteCopyForm.elements.key;
    select.replaceChildren();
    fields.forEach((field) => {
        const option = document.createElement('option');
        option.value = field.key;
        option.textContent = field.label;
        select.append(option);
    });
    updateSiteCopyInput();
}

function updateSiteCopyInput() {
    const field = siteContentFields.find((item) => item.key === elements.siteCopyForm.elements.key.value);
    elements.siteCopyForm.elements.value.value = field ? field.value : '';
}

function beginEdit(update) {
    const form = elements.contentForm;
    form.elements.id.value = update.id;
    form.elements.title.value = update.title;
    form.elements.category.value = update.category;
    form.elements.summary.value = update.summary;
    form.querySelector('[type="submit"]').lastChild.textContent = ' Save changes';
    document.getElementById('cancel-edit').classList.remove('hidden');
    document.getElementById('content-management').scrollIntoView({ behavior: 'smooth' });
    form.elements.title.focus();
}

function resetContentForm() {
    elements.contentForm.reset();
    elements.contentForm.elements.id.value = '';
    elements.contentForm.querySelector('[type="submit"]').lastChild.textContent = ' Publish update';
    document.getElementById('cancel-edit').classList.add('hidden');
}

async function deleteUpdate(id) {
    if (!window.confirm('Delete this update from the website?')) return;
    try {
        await request(`/api/updates/${id}`, { method: 'DELETE' });
        showStatus('content-status', 'Update deleted.');
        await loadUpdates();
    } catch (error) {
        showStatus('content-status', error.message, true);
    }
}

async function loadUsers() {
    const { users } = await request('/api/users');
    elements.userList.replaceChildren();
    users.forEach((user) => {
        const row = document.createElement('tr');
        row.className = 'border-b border-outline-variant/30';
        row.append(makeCell(user.name), makeCell(user.email));
        const roleCell = document.createElement('td');
        roleCell.className = 'p-sm';
        const roleSelect = document.createElement('select');
        roleSelect.className = 'rounded border border-outline-variant bg-surface-bright p-1';
        ['Administrator', 'Editor', 'Reporter'].forEach((role) => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            roleSelect.append(option);
        });
        roleSelect.value = user.role;
        roleSelect.addEventListener('change', async () => {
            try {
                await request(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ role: roleSelect.value }) });
                showStatus('user-status', `Updated ${user.email}'s role.`);
            } catch (error) {
                showStatus('user-status', error.message, true);
                await loadUsers();
            }
        });
        roleCell.append(roleSelect);
        row.append(roleCell);
        const stateCell = makeCell(user.active ? 'Active' : 'Inactive');
        row.append(stateCell);
        const actionCell = document.createElement('td');
        actionCell.className = 'p-sm';
        actionCell.append(makeButton(user.active ? 'Deactivate' : 'Reactivate', async () => {
            try {
                await request(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ active: !user.active }) });
                showStatus('user-status', `Account ${user.active ? 'deactivated' : 'reactivated'}.`);
                await loadUsers();
            } catch (error) {
                showStatus('user-status', error.message, true);
            }
        }, 'rounded border border-outline-variant px-2 py-1 text-sm hover:bg-surface-container'));
        row.append(actionCell);
        elements.userList.append(row);
    });
}

function addDonationRow(table, donation) {
    const row = document.createElement('tr');
    row.className = 'border-b border-outline-variant/30';
    row.append(
        makeCell(donation.donor),
        makeCell(donation.campaign),
        makeCell(`UGX ${(donation.amount_cents / 100).toLocaleString()}`),
        makeCell(donation.status),
        makeCell(new Date(donation.created_at + 'Z').toLocaleDateString())
    );
    table.append(row);
}

async function loadReports() {
    const { donations, totals } = await request('/api/reports');
    const total = `UGX ${(totals.amount_cents / 100).toLocaleString()}`;
    document.getElementById('report-donation-total').textContent = total;
    document.getElementById('report-donation-count').textContent = `${totals.completed} of ${totals.count}`;
    document.getElementById('donation-total').textContent = total;
    elements.donations.replaceChildren();
    elements.dashboardDonations.replaceChildren();
    donations.forEach((donation) => {
        addDonationRow(elements.donations, donation);
        addDonationRow(elements.dashboardDonations, donation);
    });
    if (!donations.length) {
        elements.donations.innerHTML = '<tr><td class="p-sm text-on-surface-variant" colspan="5">No donation records are available yet.</td></tr>';
        elements.dashboardDonations.innerHTML = '<tr><td class="p-md text-on-surface-variant" colspan="4">No donation records are available yet.</td></tr>';
    }
}

async function loadRoleData() {
    const tasks = [loadUpdates()];
    if (signedInUser.role === 'Administrator' || signedInUser.role === 'Editor') tasks.push(loadSiteCopy());
    if (signedInUser.role === 'Administrator') tasks.push(loadUsers(), loadReports());
    if (signedInUser.role === 'Reporter') tasks.push(loadReports());
    await Promise.all(tasks);
}

document.querySelectorAll('nav a[href^="#"], #admin-mobile-menu a').forEach((link) => {
    link.addEventListener('click', () => {
        document.querySelectorAll('nav a[href^="#"]').forEach((item) => item.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'page');
        document.getElementById('admin-mobile-menu').classList.add('hidden');
    });
});

document.querySelector('[data-admin-menu-button]').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const menu = document.getElementById(button.getAttribute('aria-controls'));
    const isOpen = !menu.classList.toggle('hidden');
    button.setAttribute('aria-expanded', String(isOpen));
});

document.addEventListener('click', (event) => {
    const menu = document.getElementById('admin-mobile-menu');
    const button = document.querySelector('[data-admin-menu-button]');
    if (menu.classList.contains('hidden') || button.contains(event.target) || menu.contains(event.target)) return;
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
});

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = document.getElementById('admin-mobile-menu');
    const button = document.querySelector('[data-admin-menu-button]');
    if (menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
    button.focus();
});

elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.loginForm.reportValidity()) return;
    const form = new FormData(elements.loginForm);
    const button = elements.loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    elements.loginError.classList.add('hidden');
    try {
        const { user } = await request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
        });
        showWorkspace(user);
    } catch (error) {
        elements.loginError.textContent = error.message;
        elements.loginError.classList.remove('hidden');
    } finally {
        button.disabled = false;
    }
});

elements.siteCopyForm.elements.key.addEventListener('change', updateSiteCopyInput);
elements.siteCopyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.siteCopyForm.reportValidity()) return;
    const key = elements.siteCopyForm.elements.key.value;
    try {
        const result = await request(`/api/site-content/${encodeURIComponent(key)}`, {
            method: 'PUT',
            body: JSON.stringify({ value: elements.siteCopyForm.elements.value.value })
        });
        const field = siteContentFields.find((item) => item.key === result.key);
        if (field) field.value = result.value;
        showStatus('site-copy-status', 'Page text saved and now visible on the public site.');
    } catch (error) {
        showStatus('site-copy-status', error.message, true);
    }
});

elements.contentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.contentForm.reportValidity()) return;
    const formData = new FormData(elements.contentForm);
    const id = formData.get('id');
    const payload = JSON.stringify({
        title: formData.get('title'),
        category: formData.get('category'),
        summary: formData.get('summary')
    });
    try {
        await request(id ? `/api/updates/${id}` : '/api/updates', {
            method: id ? 'PATCH' : 'POST',
            body: payload
        });
        showStatus('content-status', id ? 'Update saved.' : 'Update published.');
        resetContentForm();
        await loadUpdates();
    } catch (error) {
        showStatus('content-status', error.message, true);
    }
});

document.getElementById('cancel-edit').addEventListener('click', resetContentForm);
document.getElementById('new-update-button').addEventListener('click', () => {
    document.getElementById('content-management').scrollIntoView({ behavior: 'smooth' });
    elements.contentForm.elements.title.focus();
});

elements.userForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.userForm.reportValidity()) return;
    const formData = new FormData(elements.userForm);
    try {
        await request('/api/users', {
            method: 'POST',
            body: JSON.stringify(Object.fromEntries(formData.entries()))
        });
        showStatus('user-status', 'Account created. Give the initial password to the user securely.');
        elements.userForm.reset();
        await loadUsers();
    } catch (error) {
        showStatus('user-status', error.message, true);
    }
});

document.getElementById('download-report').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/reports.csv', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Unable to download report.');
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'creation-stewards-donor-report.csv';
        link.click();
        URL.revokeObjectURL(link.href);
        showStatus('report-status', 'Report downloaded.');
    } catch (error) {
        showStatus('report-status', error.message, true);
    }
});

document.getElementById('logout-button').addEventListener('click', async () => {
    try {
        await request('/api/auth/logout', { method: 'POST' });
    } finally {
        window.location.reload();
    }
});

request('/api/auth/session')
    .then(({ user }) => showWorkspace(user))
    .catch(() => document.getElementById('login-screen').classList.remove('hidden'));
