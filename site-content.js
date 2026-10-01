fetch('/api/site-content')
    .then((response) => {
        if (!response.ok) throw new Error('Page content is unavailable.');
        return response.json();
    })
    .then(({ fields }) => {
        fields.forEach((field) => {
            if (field.value === field.defaultValue) return;
            document.querySelectorAll('[data-site-content]').forEach((element) => {
                if (element.dataset.siteContent === field.key) element.textContent = field.value;
            });
        });
    })
    .catch(() => {});
