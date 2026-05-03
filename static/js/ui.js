/**
 * Brain3D - UI Manager
 */

class UIManager {
    constructor() {
        this.elements = {
            statsPanel: document.getElementById('stats-panel'),
            infoPanel: document.getElementById('info-panel'),
            panelTitle: document.getElementById('panel-title'),
            panelContent: document.getElementById('panel-content'),
            breadcrumb: document.getElementById('breadcrumb'),
            breadcrumbPath: document.getElementById('breadcrumb-path'),
            statMachines: document.getElementById('stat-machines'),
            statSkills: document.getElementById('stat-skills'),
            statUp: document.getElementById('stat-up'),
            statWorking: document.getElementById('stat-working'),
            statError: document.getElementById('stat-error'),
        };

        this._setupControls();
    }

    _setupControls() {
        // Reset view
        document.getElementById('btn-reset-view')?.addEventListener('click', () => {
            scene3d?.resetView();
        });

        // Toggle auto-rotate
        document.getElementById('btn-toggle-rotate')?.addEventListener('click', (e) => {
            const active = scene3d?.toggleAutoRotate();
            e.target.classList.toggle('active', active);
        });

        // Toggle metrics
        document.getElementById('btn-toggle-metrics')?.addEventListener('click', (e) => {
            const visible = machineRenderer?.toggleMetrics();
            e.target.classList.toggle('active', visible);
        });

        // Refresh
        document.getElementById('btn-refresh')?.addEventListener('click', () => {
            wsClient.requestRefresh();
        });

        // Close panel
        document.getElementById('btn-close-panel')?.addEventListener('click', () => {
            this.hideInfoPanel();
        });
    }

    updateStats(state) {
        if (!state) return;

        if (this.elements.statMachines) {
            this.elements.statMachines.textContent = state.total_machines || 0;
        }
        if (this.elements.statSkills) {
            this.elements.statSkills.textContent = state.total_skills || 0;
        }
        if (this.elements.statUp) {
            this.elements.statUp.textContent = state.skills_up || 0;
        }
        if (this.elements.statWorking) {
            this.elements.statWorking.textContent = state.skills_working || 0;
        }
        if (this.elements.statError) {
            this.elements.statError.textContent = state.skills_error || 0;
        }
    }

    showMachineInfo(machine) {
        if (!machine) return;

        if (this.elements.panelTitle) {
            const icon = this._getMachineIcon(machine.machine_type);
            this.elements.panelTitle.innerHTML = `${icon} ${machine.hostname || machine.node_id}`;
        }

        if (this.elements.panelContent) {
            const statusClass = `status-${(machine.status || 'unknown').toLowerCase()}`;
            const typeLabel = this._getTypeLabel(machine.machine_type);

            this.elements.panelContent.innerHTML = `
                <div class="info-row">
                    <span class="info-label">Status</span>
                    <span class="info-value ${statusClass}">${machine.status || 'Unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Type</span>
                    <span class="info-value">${typeLabel}</span>
                </div>
                ${machine.role ? `
                <div class="info-row">
                    <span class="info-label">Role</span>
                    <span class="info-value" style="font-size: 11px;">${machine.role}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">IP</span>
                    <span class="info-value">${machine.ip || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Platform</span>
                    <span class="info-value">${machine.platform || 'Unknown'}</span>
                </div>
                ${machine.has_heart ? `
                <div class="info-row">
                    <span class="info-label">Heart</span>
                    <span class="info-value" style="color: #00ff88;">v${machine.heart_version || '?'}</span>
                </div>
                ` : ''}
                ${machine.skills_count > 0 ? `
                <div class="info-row">
                    <span class="info-label">Skills</span>
                    <span class="info-value">${machine.skills_installed || 0} / ${machine.skills_count}</span>
                </div>
                ` : ''}
                ${machine.wol_enabled ? `
                <div class="info-row">
                    <span class="info-label">Wake-on-LAN</span>
                    <span class="info-value" style="color: #00d4aa;">Enabled</span>
                </div>
                ` : ''}
                ${machine.mac ? `
                <div class="info-row">
                    <span class="info-label">MAC</span>
                    <span class="info-value" style="font-size: 10px; font-family: monospace;">${machine.mac}</span>
                </div>
                ` : ''}
                ${machine.metrics && this._hasMetrics(machine.metrics) ? this._renderMetrics(machine.metrics) : ''}
                ${machine.has_heart ? this._renderActions(machine) : ''}
            `;
        }

        if (this.elements.infoPanel) {
            this.elements.infoPanel.classList.remove('hidden');
        }
    }

    _getMachineIcon(type) {
        const icons = {
            core: '🧠',
            forge: '🔨',
            heart: '💚',
            network: '🌐',
            proxy_target: '👁️',
        };
        return icons[type] || '📦';
    }

    _getTypeLabel(type) {
        const labels = {
            core: 'Core (OnyxSoma)',
            forge: 'Forge (Dev)',
            heart: 'Heart Node',
            network: 'Network Device',
            proxy_target: 'Proxy Target',
        };
        return labels[type] || type || 'Unknown';
    }

    _hasMetrics(metrics) {
        return metrics && (metrics.cpu_percent > 0 || metrics.ram_percent > 0 || metrics.disk_percent > 0);
    }

    _renderActions(machine) {
        return `
            <div class="panel-actions">
                <button class="action-btn" onclick="wsClient.requestRefresh()" title="Refresh">🔄 Refresh</button>
            </div>
        `;
    }

    _renderMetrics(metrics) {
        return `
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">${Math.round(metrics.cpu_percent || 0)}%</div>
                    <div class="metric-label">CPU</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${Math.round(metrics.ram_percent || 0)}%</div>
                    <div class="metric-label">RAM</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${Math.round(metrics.disk_percent || 0)}%</div>
                    <div class="metric-label">Disk</div>
                </div>
                ${metrics.temp_celsius ? `
                <div class="metric-card">
                    <div class="metric-value">${Math.round(metrics.temp_celsius)}°C</div>
                    <div class="metric-label">Temp</div>
                </div>
                ` : ''}
            </div>
        `;
    }

    hideInfoPanel() {
        if (this.elements.infoPanel) {
            this.elements.infoPanel.classList.add('hidden');
        }
    }

    showBreadcrumb(path) {
        if (this.elements.breadcrumbPath) {
            this.elements.breadcrumbPath.textContent = `Network / ${path}`;
        }
        if (this.elements.breadcrumb) {
            this.elements.breadcrumb.classList.remove('hidden');
        }
    }

    hideBreadcrumb() {
        if (this.elements.breadcrumb) {
            this.elements.breadcrumb.classList.add('hidden');
        }
    }

    showNotification(message, type = 'info') {
        // TODO: Implement toast notifications
        console.log(`[${type}] ${message}`);
    }

    /**
     * Show skill details.
     *
     * Args:
     *     skill: Skill object
     *     machineName: optional machine hostname
     */
    showSkillInfo(skill, machineName = null) {
        if (!skill) return;

        if (this.elements.panelTitle) {
            this.elements.panelTitle.innerHTML = `📦 ${skill.name}`;
        }

        if (this.elements.panelContent) {
            const statusClass = `status-${(skill.status || 'unknown').toLowerCase()}`;
            this.elements.panelContent.innerHTML = `
                <div class="info-row">
                    <span class="info-label">Status</span>
                    <span class="info-value ${statusClass}">${skill.status || 'Unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Version</span>
                    <span class="info-value">${skill.version || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Brain Area</span>
                    <span class="info-value">${skill.brain_area || 'N/A'}</span>
                </div>
                ${machineName ? `
                <div class="info-row">
                    <span class="info-label">Machine</span>
                    <span class="info-value">${machineName}</span>
                </div>
                ` : ''}
                ${skill.port ? `
                <div class="info-row">
                    <span class="info-label">Port</span>
                    <span class="info-value" style="font-family: monospace;">${skill.port}</span>
                </div>
                ` : ''}
            `;
        }

        if (this.elements.infoPanel) {
            this.elements.infoPanel.classList.remove('hidden');
        }
    }

    /**
     * Show brain area details.
     *
     * Args:
     *     area: Area object
     *     skills: Array of Skill objects in this area
     */
    showAreaInfo(area, skills = []) {
        if (!area) return;

        if (this.elements.panelTitle) {
            this.elements.panelTitle.innerHTML = `🧠 ${area.name || area.id}`;
        }

        if (this.elements.panelContent) {
            const statusClass = `status-${(area.status || 'unknown').toLowerCase()}`;
            const activeCount = skills.filter((s) => s.status === 'UP').length;

            this.elements.panelContent.innerHTML = `
                <div class="info-row">
                    <span class="info-label">Status</span>
                    <span class="info-value ${statusClass}">${area.status || 'Unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Skills</span>
                    <span class="info-value">${activeCount}/${skills.length}</span>
                </div>
                ${skills.length > 0 ? `
                <div class="info-section">
                    <h4 style="margin: 8px 0 4px 0; font-size: 12px;">Skills</h4>
                    ${skills.map((s) => `
                        <div style="font-size: 11px; margin: 2px 0; padding: 2px 4px; background: rgba(255,255,255,0.05); border-radius: 2px;">
                            <span style="color: ${this._getStatusColor(s.status)};">●</span> ${s.name} (${s.status})
                        </div>
                    `).join('')}
                </div>
                ` : ''}
            `;
        }

        if (this.elements.infoPanel) {
            this.elements.infoPanel.classList.remove('hidden');
        }
    }

    /**
     * Get CSS color for status.
     *
     * Args:
     *     status: Status string
     *
     * Returns:
     *     CSS color value
     */
    _getStatusColor(status) {
        const colors = {
            UP: '#00ff88',
            WORKING: '#ff00ff',
            DOWN: '#555555',
            ERROR: '#ff8800',
            UNKNOWN: '#666666',
        };
        return colors[status] || colors.UNKNOWN;
    }

    /**
     * Set active view button.
     *
     * Args:
     *     viewName: 'network' | 'machine' | 'area'
     */
    setActiveViewButton(viewName) {
        document.querySelectorAll('#view-selector .view-btn').forEach((btn) => {
            btn.classList.remove('active');
        });
        const btnId = `btn-view-${viewName}`;
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.classList.add('active');
        }
    }
}

// Global instance
let ui = null;
