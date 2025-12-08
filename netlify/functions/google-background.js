// Netlify Background Function - For long-running story generation (up to 15 minutes)
// Node 18+ has native fetch, no need for node-fetch

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// In-memory storage for job status (in production, use a database like Redis/Supabase)
const jobStore = new Map();

/**
 * Background function handler - runs async, up to 15 minutes
 */
exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { action, jobId, endpoint, body } = JSON.parse(event.body);

        // Action: Start a new background job
        if (action === 'start') {
            const newJobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Initialize job status
            jobStore.set(newJobId, {
                status: 'queued',
                progress: 0,
                createdAt: new Date().toISOString(),
                result: null,
                error: null
            });

            // Start background processing (don't await - fire and forget)
            processStoryGeneration(newJobId, endpoint, body).catch(error => {
                console.error(`Job ${newJobId} failed:`, error);
                jobStore.set(newJobId, {
                    ...jobStore.get(newJobId),
                    status: 'failed',
                    error: error.message
                });
            });

            // Return immediately with 202 Accepted and job ID
            return {
                statusCode: 202,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: newJobId,
                    status: 'queued',
                    message: 'Story generation started'
                })
            };
        }

        // Action: Check job status
        if (action === 'status') {
            if (!jobId || !jobStore.has(jobId)) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: 'Job not found' })
                };
            }

            const jobStatus = jobStore.get(jobId);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jobStatus)
            };
        }

        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid action. Use "start" or "status"' })
        };

    } catch (error) {
        console.error('Background function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

/**
 * Background processing function - can run up to 15 minutes
 */
async function processStoryGeneration(jobId, endpoint, requestBody) {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY not configured');
    }

    try {
        // Update status to processing
        updateJobProgress(jobId, 'processing', 5, 'Generating story content...');

        // Call Google API
        const url = `${API_BASE_URL}/${endpoint}?key=${apiKey}`;
        console.log(`[${new Date().toISOString()}] Job ${jobId} - Starting ${endpoint}`);

        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const duration = Date.now() - startTime;
        const data = await response.json();

        if (!response.ok) {
            throw new Error(`API error: ${response.status} - ${JSON.stringify(data)}`);
        }

        console.log(`[${new Date().toISOString()}] Job ${jobId} - Completed in ${duration}ms`);

        // Update with success result
        updateJobProgress(jobId, 'completed', 100, 'Story generated!', data);

    } catch (error) {
        console.error(`Job ${jobId} error:`, error);
        updateJobProgress(jobId, 'failed', 0, error.message, null, error.message);
        throw error;
    }
}

/**
 * Helper to update job progress
 */
function updateJobProgress(jobId, status, progress, message = '', result = null, error = null) {
    const currentJob = jobStore.get(jobId) || {};
    jobStore.set(jobId, {
        ...currentJob,
        status,
        progress,
        message,
        result,
        error,
        updatedAt: new Date().toISOString()
    });
}

// Cleanup old jobs every hour (to prevent memory leaks)
setInterval(() => {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [jobId, job] of jobStore.entries()) {
        const createdAt = new Date(job.createdAt).getTime();
        if (now - createdAt > maxAge) {
            jobStore.delete(jobId);
            console.log(`Cleaned up old job: ${jobId}`);
        }
    }
}, 60 * 60 * 1000);
