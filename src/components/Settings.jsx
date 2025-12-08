import { useState, useEffect } from 'react';
import { getApiKey, setApiKey } from '../services/storageService';

export default function Settings({ onClose }) {
    const [apiKey, setApiKeyState] = useState('');

    useEffect(() => {
        const key = getApiKey();
        if (key) setApiKeyState(key);
    }, []);

    const handleSave = () => {
        if (apiKey.trim()) {
            setApiKey(apiKey.trim());
            alert('API key saved successfully!');
            onClose();
        } else {
            alert('Please enter a valid API key');
        }
    };

    return (
        <div className="modal active">
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal-content settings-modal">
                <button className="modal-close" onClick={onClose}>&times;</button>

                <div className="settings-content">
                    <h3 className="step-title">API Settings</h3>
                    <p className="step-description">Configure your Google AI Studio API key</p>

                    <div className="form-group">
                        <label htmlFor="apiKey">Google AI Studio API Key</label>
                        <input
                            type="password"
                            id="apiKey"
                            value={apiKey}
                            onChange={(e) => setApiKeyState(e.target.value)}
                            placeholder="sk-or-v1-..."
                        />
                        <small className="form-hint">
                            Get your FREE API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>
                        </small>
                    </div>

                    <button className="save-btn" onClick={handleSave}>Save Settings</button>
                </div>
            </div>
        </div>
    );
}
