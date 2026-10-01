const updatesContainer = document.getElementById('public-updates');

if (updatesContainer) {
    fetch('/api/updates')
        .then((response) => {
            if (!response.ok) throw new Error('Updates are temporarily unavailable.');
            return response.json();
        })
        .then(({ updates }) => {
            updatesContainer.replaceChildren();
            if (!updates.length) {
                updatesContainer.textContent = 'New program updates will appear here.';
                return;
            }

            updates.slice(0, 6).forEach((update) => {
                const article = document.createElement('article');
                article.className = 'rounded-lg border border-primary/10 bg-surface-container-lowest p-md';
                const category = document.createElement('p');
                category.className = 'font-label-md text-label-md text-secondary';
                category.textContent = update.category;
                const title = document.createElement('h3');
                title.className = 'font-title-lg text-title-lg text-primary mt-2';
                title.textContent = update.title;
                const summary = document.createElement('p');
                summary.className = 'font-body-md text-body-md text-on-surface-variant mt-2';
                summary.textContent = update.summary;
                const date = document.createElement('p');
                date.className = 'text-xs text-on-surface-variant mt-3';
                date.textContent = new Date(update.createdAt + 'Z').toLocaleDateString();
                article.append(category, title, summary, date);
                updatesContainer.append(article);
            });
        })
        .catch(() => {
            updatesContainer.textContent = 'Updates are temporarily unavailable.';
        });
}
