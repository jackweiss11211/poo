document.getElementById('searchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const queryInput = document.getElementById('query');
    const resultMessage = document.getElementById('resultMessage');
    const loadingSpinner = document.getElementById('loadingSpinner');

    // Reset previous states
    resultMessage.textContent = '';
    resultMessage.classList.remove('alert-success', 'alert-danger');
    loadingSpinner.style.display = 'block';

    const query = queryInput.value.trim();

    // Client-side validation
    if (query.length < 2 || query.length > 100) {
        showError('Search term must be between 2 and 100 characters.');
        return;
    }

    try {
        const response = await fetch('/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
            timeout: 60000 // 1-minute timeout
        });

        loadingSpinner.style.display = 'none';

        if (response.ok) {
            const blob = await response.blob();
            
            // Check blob size
            if (blob.size === 0) {
                showError('No videos found for your search.');
                return;
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `videos_${query.replace(/\s+/g, '_')}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();

            showSuccess('Download started! Check your downloads folder.');
        } else {
            const errorData = await response.json();
            showError(errorData.details || 'Error during search or download.');
        }
    } catch (error) {
        loadingSpinner.style.display = 'none';
        console.error('Error:', error);
        
        if (error.name === 'AbortError') {
            showError('Request timed out. Please try again.');
        } else {
            showError('Network error. Please check your connection.');
        }
    }
});

function showError(message) {
    const resultMessage = document.getElementById('resultMessage');
    resultMessage.textContent = message;
    resultMessage.classList.add('alert-danger');
    resultMessage.classList.remove('alert-success');
}

function showSuccess(message) {
    const resultMessage = document.getElementById('resultMessage');
    resultMessage.textContent = message;
    resultMessage.classList.add('alert-success');
    resultMessage.classList.remove('alert-danger');
}
