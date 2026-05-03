/**
 * Brain3D - UI Manager v5.0
 *
 * Manages stats panel and right-side machine info panel.
 */

class UIManager {
    constructor() {
        this._panel = document.getElementById('machine-panel');
        this._hostname = document.getElementById('mp-hostname');
        this._icon = document.getElementById('mp-icon');
        this._ip = document.getElementById('mp-ip');
        this._statusDot = document.getElementById('mp-status-dot');
        this._statusText = document.getElementById('mp-status-text');
        this._skillsList = document.getElementById('mp-skills-list');
        this._skillsCount = document.getElementById('mp-skills-count');

        this._statMachines = document.getElementById('stat-machines');
        this._statSkills = document.getElementById('stat-skills');
        this._statUp = document.getElementById('stat-up');
        this._statWorking = document.getElementById('stat-working');
        this._statError = document.getElementById('stat-error');

        this._currentNodeId = null;

        document.getElementById('mp-close')?.addEventListener('click', () => this.hidePanel());
        this._setupControls();
    }

    _setupControls() {
        document.getElementById('btn-reset-view')?.addEventListener('click', () => {
            scene3d?.resetView();
        });
        document.getElementById('btn-toggle-rotate')?.addEventListener('click', (e) => {
            const active = scene3d?.toggleAutoRotate();
            e.target.classList.toggle('active', active);
        });
        document.getElementById('btn-refresh')?.addEventListener('click', () => {
            wsClient.requestRefresh();
        });
    }

    /**
     * Update stats panel from network state.
     *
     * Args:
     *     state: NetworkState object
     */
    updateStats(state) {
        if (!state) return;
        if (this._statMachines) this._statMachines.textContent = state.total_machines ?? 0;
        if (this._statSkills)   this._statSkills.textContent   = state.total_skills ?? 0;
        if (this._statUp)       this._statUp.textContent       = state.skills_up ?? 0;
        if (this._statWorking)  this._statWorking.textContent  = state.skills_working ?? 0;
        if (this._statError)    this._statError.textContent    = state.skills_error ?? 0;
    }

    /**
     * Show machine info panel with skills list.
     *
     * Args:
     *     machineData: userData from Three.js mesh
     */
    showMachineSkills(machineData) {
        if (!machineData) return;
        this._currentNodeId = machineData.nodeId;

        // Header
        this._icon.textContent = machineData.isCore ? '🧠' : '🖥';
        this._hostname.textContent = machineData.hostname || machineData.nodeId;

        // Meta
        this._ip.textContent = machineData.ip || '—';
        const norm = this._normalizeStatus(machineData.status);
        this._statusDot.style.color = this._statusColor(norm);
        this._statusDot.textContent = '●';
        this._statusText.textContent = norm;
        this._statusText.style.color = this._statusColor(norm);

        // Skills
        const skills = machineData.local_skills || [];
        this._skillsCount.textContent = skills.length ? `(${skills.length})` : '';
        this._skillsList.innerHTML = '';

        if (skills.length === 0) {
            this._skillsList.innerHTML = '<div style="padding:12px 16px; color:#444; font-size:12px;">Aucun skill déployé</div>';
        } else {
            skills.forEach((s) => {
                const norm = this._normalizeStatus(s.status);
                const color = this._statusColor(norm);
                const row = document.createElement('div');
                row.className = 'skill-row';
                row.dataset.skill = s.name;
                row.innerHTML = `
                    <span class="skill-dot" style="color:${color}">●</span>
                    <span class="skill-name" title="${s.name}">${s.name}</span>
                    <span class="skill-status" style="color:${color}">${norm}</span>`;
                this._skillsList.appendChild(row);
            });
        }

        this._panel.classList.remove('hidden');
    }

    /**
     * Update a skill's status dot in the open panel.
     *
     * Args:
     *     skillName: Skill name string
     *     status: New status string
     */
    updateSkillStatus(skillName, status) {
        const row = this._skillsList?.querySelector(`[data-skill="${skillName}"]`);
        if (!row) return;
        const norm = this._normalizeStatus(status);
        const color = this._statusColor(norm);
        const dot = row.querySelector('.skill-dot');
        const st  = row.querySelector('.skill-status');
        if (dot) dot.style.color = color;
        if (st)  { st.textContent = norm; st.style.color = color; }
    }

    /**
     * Hide the machine panel.
     */
    hidePanel() {
        this._panel.classList.add('hidden');
        this._currentNodeId = null;
    }

    // Keep backward-compat alias used by network-view.js
    hideInfoPanel() { this.hidePanel(); }

    /**
     * Normalize Heart/Core status to canonical uppercase form.
     *
     * Args:
     *     status: Raw status string
     *
     * Returns:
     *     Canonical status (UP, DOWN, ERROR, WORKING, UNKNOWN)
     */
    _normalizeStatus(status) {
        if (!status) return 'UNKNOWN';
        const s = String(status).toLowerCase();
        const map = {
            running: 'UP', loaded: 'UP', up: 'UP', healthy: 'UP', ok: 'UP',
            stopped: 'DOWN', down: 'DOWN', unknown: 'UNKNOWN',
            working: 'WORKING', busy: 'WORKING',
            error: 'ERROR',
        };
        return map[s] || s.toUpperCase();
    }

    /**
     * Get CSS color string for a canonical status.
     *
     * Args:
     *     status: Canonical status string
     *
     * Returns:
     *     CSS color value
     */
    _statusColor(status) {
        const colors = { UP: '#00ff88', WORKING: '#ff00ff', DOWN: '#555', ERROR: '#ff8800', UNKNOWN: '#555' };
        return colors[status] || '#666';
    }
}

// Global instance
let ui = null;
