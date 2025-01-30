document.getElementById('searchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = document.getElementById('query').value;
    const resultDiv = document.getElementById('result');
    resultDiv.textContent = 'Searching...';

    try {
        const response = await fetch('/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'videos.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            resultDiv.textContent = 'Download ready!';
        } else {
            resultDiv.textContent = 'Error during search or download.';
        }
    } catch (error) {
        console.error('Error:', error);
        resultDiv.textContent = 'An error occurred.';
    }
});
