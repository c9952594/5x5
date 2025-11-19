const app = {
    // Settings (will be loaded from localStorage)
    settings: {
        barWeight: 20,
        platePairs: [20, 20, 10, 5, 2.5, 1.25], // Actual plate pairs available
        restTimer: 180, // seconds
        increments: {
            squat: 2.5,
            bench: 2.5,
            row: 2.5,
            ohp: 2.5,
            deadlift: 5
        }
    },

    exercises: {
        squat: { name: 'Squat', weight: 20 },
        bench: { name: 'Bench Press', weight: 20 },
        row: { name: 'Barbell Row', weight: 30 },
        ohp: { name: 'Overhead Press', weight: 20 },
        deadlift: { name: 'Deadlift', weight: 40 }
    },

    workouts: [],
    currentWorkout: null,
    restTimerInterval: null,
    restTimerEnd: null,

    init() {
        this.loadData();
        this.renderHistory();
        
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js');
        }
    },

    loadData() {
        const saved = localStorage.getItem('5x5-data');
        if (saved) {
            const data = JSON.parse(saved);
            this.exercises = data.exercises || this.exercises;
            this.workouts = data.workouts || [];
            this.settings = data.settings || this.settings;
        }
    },

    saveData() {
        localStorage.setItem('5x5-data', JSON.stringify({
            exercises: this.exercises,
            workouts: this.workouts,
            settings: this.settings
        }));
    },

    showNewWorkout() {
        document.getElementById('workoutForm').classList.remove('hidden');
        
        // Auto-select next workout type based on last workout
        const lastWorkout = this.workouts[0];
        const nextType = lastWorkout ? (lastWorkout.type === 'A' ? 'B' : 'A') : 'A';
        document.getElementById('workoutType').value = nextType;
        
        this.selectWorkoutType();
    },

    selectWorkoutType() {
        const type = document.getElementById('workoutType').value;
        const grid = document.getElementById('exerciseGrid');
        
        if (!type) {
            grid.innerHTML = '';
            return;
        }

        const exerciseList = type === 'A' 
            ? ['squat', 'bench', 'row']
            : ['squat', 'ohp', 'deadlift'];

        this.currentWorkout = {
            date: new Date().toISOString(),
            type: type,
            exercises: {}
        };

        grid.innerHTML = exerciseList.map(key => {
            const ex = this.exercises[key];
            const sets = key === 'deadlift' ? 1 : 5;
            const weight = this.calculateNextWeight(key);
            const plateResult = this.calculatePlates(weight);
            
            let plateHtml = plateResult.display;
            if (plateResult.diff !== 0 && plateResult.diff !== undefined) {
                plateHtml += `<br><strong>Actual: ${plateResult.actualWeight}kg</strong>`;
                plateHtml += ` <button class="small-btn" onclick="app.useActualWeight('${key}', ${plateResult.actualWeight})">Use This Weight</button>`;
            } else {
                plateHtml += `<br><strong>Total: ${plateResult.actualWeight}kg</strong>`;
            }
            
            return `
                <div class="exercise-item">
                    <div class="exercise-header">
                        <span class="exercise-name">${ex.name}</span>
                    </div>
                    <div class="weight-input">
                        <label>Weight (kg):</label>
                        <input type="number" step="2.5" value="${weight}" 
                               id="weight-${key}" 
                               onchange="app.updatePlates('${key}')">
                    </div>
                    <div class="sets-display">
                        ${Array.from({length: sets}, (_, i) => `
                            <input type="checkbox" id="set-${key}-${i}" 
                                   onchange="app.handleSetCheck('${key}', ${i})">
                        `).join('')}
                    </div>
                    <div class="plate-calculation" id="plates-${key}">
                        ${plateHtml}
                    </div>
                    <div class="timer-display" id="timer-${key}"></div>
                </div>
            `;
        }).join('');
    },

    updatePlates(exerciseKey) {
        const weight = parseFloat(document.getElementById(`weight-${exerciseKey}`).value);
        const result = this.calculatePlates(weight);
        const plateDiv = document.getElementById(`plates-${exerciseKey}`);
        
        let html = result.display;
        if (result.diff !== 0 && result.diff !== undefined) {
            html += `<br><strong>Actual: ${result.actualWeight}kg</strong>`;
            html += ` <button class="small-btn" onclick="app.useActualWeight('${exerciseKey}', ${result.actualWeight})">Use This Weight</button>`;
        } else {
            html += `<br><strong>Total: ${result.actualWeight}kg</strong>`;
        }
        
        plateDiv.innerHTML = html;
    },

    useActualWeight(exerciseKey, actualWeight) {
        document.getElementById(`weight-${exerciseKey}`).value = actualWeight;
        this.updatePlates(exerciseKey);
    },

    calculatePlates(totalWeight) {
        const targetPerSide = (totalWeight - this.settings.barWeight) / 2;
        
        if (targetPerSide <= 0) {
            return { display: `Bar only`, actualWeight: this.settings.barWeight };
        }

        // Safety check - ensure platePairs exists and is an array
        if (!this.settings.platePairs || !Array.isArray(this.settings.platePairs) || this.settings.platePairs.length === 0) {
            return { display: `No plates configured`, actualWeight: this.settings.barWeight };
        }

        // Create a copy of available plates and sort descending
        const availablePlates = [...this.settings.platePairs].sort((a, b) => b - a);
        const usedPlates = [];
        let remaining = targetPerSide;

        // Greedy algorithm - use largest plates first
        for (let i = 0; i < availablePlates.length; i++) {
            const plate = availablePlates[i];
            if (plate <= remaining) {
                usedPlates.push(plate);
                remaining -= plate;
                availablePlates.splice(i, 1); // Remove this plate from available inventory
                i--; // Recheck same index since we removed an item
            }
        }

        const actualPerSide = usedPlates.reduce((sum, p) => sum + p, 0);
        const actualWeight = this.settings.barWeight + (actualPerSide * 2);
        const diff = totalWeight - actualWeight;

        if (usedPlates.length === 0) {
            return { display: `Bar only (not enough plates)`, actualWeight: this.settings.barWeight };
        }

        // Group plates by weight for display
        const plateGroups = {};
        usedPlates.forEach(p => {
            plateGroups[p] = (plateGroups[p] || 0) + 1;
        });

        const platesDisplay = Object.entries(plateGroups)
            .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
            .map(([weight, count]) => `${count}×${weight}kg`)
            .join(', ');

        const diffText = diff > 0 ? ` (${diff}kg short)` : '';
        return { 
            display: `Per side: ${platesDisplay}${diffText}`,
            actualWeight: actualWeight,
            diff: diff
        };
    },

    calculateNextWeight(exerciseKey) {
        // Get last 3 workouts for this exercise
        const recentWorkouts = this.workouts
            .filter(w => w.exercises[exerciseKey])
            .slice(0, 3);

        if (recentWorkouts.length === 0) {
            return this.exercises[exerciseKey].weight;
        }

        const lastWorkout = recentWorkouts[0];
        const lastData = lastWorkout.exercises[exerciseKey];

        // Check if all sets were completed
        if (lastData.completed === lastData.sets) {
            // Success - increase weight
            return lastData.weight + this.settings.increments[exerciseKey];
        } else if (recentWorkouts.length === 3 && 
                   recentWorkouts.every(w => w.exercises[exerciseKey].completed < w.exercises[exerciseKey].sets)) {
            // Failed 3 times in a row - decrease by 10%
            const newWeight = lastData.weight * 0.9;
            return this.roundToAvailablePlates(newWeight);
        } else {
            // Keep same weight
            return lastData.weight;
        }
    },

    roundToAvailablePlates(targetWeight) {
        // Round to nearest possible weight with available plates
        const barWeight = this.settings.barWeight;
        const weightPerSide = (targetWeight - barWeight) / 2;
        
        if (weightPerSide <= 0) return barWeight;

        // Find the smallest plate
        const minPlate = Math.min(...this.settings.platePairs);
        const increment = minPlate * 2; // Both sides
        
        return Math.round((targetWeight - barWeight) / increment) * increment + barWeight;
    },

    handleSetCheck(exerciseKey, setIndex) {
        const checkbox = document.getElementById(`set-${exerciseKey}-${setIndex}`);
        
        if (checkbox.checked) {
            this.startRestTimer(exerciseKey);
        }
    },

    startRestTimer(exerciseKey) {
        // Cancel existing timer if any
        this.cancelRestTimer();

        const timerDisplay = document.getElementById(`timer-${exerciseKey}`);
        this.restTimerEnd = Date.now() + (this.settings.restTimer * 1000);
        
        timerDisplay.innerHTML = `<div class="rest-timer">
            Rest: <span id="timer-countdown">${this.formatTime(this.settings.restTimer)}</span>
            <button class="timer-cancel" onclick="app.cancelRestTimer()">Cancel</button>
        </div>`;

        this.restTimerInterval = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((this.restTimerEnd - Date.now()) / 1000));
            const countdown = document.getElementById('timer-countdown');
            
            if (countdown) {
                countdown.textContent = this.formatTime(remaining);
            }

            if (remaining === 0) {
                this.playSound();
                this.cancelRestTimer();
                timerDisplay.innerHTML = '<div class="timer-complete">Rest complete!</div>';
                setTimeout(() => {
                    timerDisplay.innerHTML = '';
                }, 3000);
            }
        }, 100);
    },

    cancelRestTimer() {
        if (this.restTimerInterval) {
            clearInterval(this.restTimerInterval);
            this.restTimerInterval = null;
            this.restTimerEnd = null;
            
            // Clear all timer displays
            document.querySelectorAll('.rest-timer').forEach(el => el.remove());
        }
    },

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    playSound() {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    },

    saveWorkout() {
        const type = document.getElementById('workoutType').value;
        if (!type) return;

        const exerciseList = type === 'A' 
            ? ['squat', 'bench', 'row']
            : ['squat', 'ohp', 'deadlift'];

        this.currentWorkout.exercises = {};

        exerciseList.forEach(key => {
            const weight = parseFloat(document.getElementById(`weight-${key}`).value);
            const sets = key === 'deadlift' ? 1 : 5;
            const completedSets = Array.from({length: sets}, (_, i) => 
                document.getElementById(`set-${key}-${i}`).checked
            ).filter(Boolean).length;

            this.currentWorkout.exercises[key] = {
                weight: weight,
                sets: sets,
                completed: completedSets
            };
        });

        this.workouts.unshift(this.currentWorkout);
        this.saveData();
        this.closeWorkoutForm();
        this.renderHistory();
    },

    cancelWorkout() {
        if (confirm('Are you sure you want to cancel this workout?')) {
            this.closeWorkoutForm();
        }
    },

    closeWorkoutForm() {
        this.cancelRestTimer();
        document.getElementById('workoutForm').classList.add('hidden');
        this.currentWorkout = null;
    },

    renderHistory() {
        const list = document.getElementById('historyList');
        
        if (this.workouts.length === 0) {
            list.innerHTML = '<p>No workouts logged yet. Start your first workout!</p>';
            return;
        }

        list.innerHTML = this.workouts.map((workout, index) => {
            const date = new Date(workout.date).toLocaleDateString('en-GB', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const exercises = Object.entries(workout.exercises).map(([key, data]) => {
                const name = this.exercises[key].name;
                return `<div class="workout-exercise">
                    ${name}: ${data.weight}kg - ${data.completed}/${data.sets} sets
                </div>`;
            }).join('');

            return `
                <div class="workout-card">
                    <div class="workout-header">
                        <div class="workout-date">${date} - Workout ${workout.type}</div>
                        <div class="workout-actions">
                            <button class="icon-btn" onclick="app.editWorkout(${index})" title="Edit">✏️</button>
                            <button class="icon-btn" onclick="app.deleteWorkout(${index})" title="Delete">🗑️</button>
                        </div>
                    </div>
                    ${exercises}
                </div>
            `;
        }).join('');
    },

    editWorkout(index) {
        const workout = this.workouts[index];
        
        // Show modal for editing
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Edit Workout</h2>
                <div class="form-group">
                    <label>Date</label>
                    <input type="datetime-local" id="edit-date" value="${new Date(workout.date).toISOString().slice(0, 16)}">
                </div>
                ${Object.entries(workout.exercises).map(([key, data]) => `
                    <div class="form-group">
                        <label>${this.exercises[key].name}</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="number" step="2.5" value="${data.weight}" id="edit-weight-${key}" placeholder="Weight (kg)" style="flex: 1;">
                            <input type="number" value="${data.completed}" id="edit-completed-${key}" placeholder="Completed" style="width: 80px;" min="0" max="${data.sets}">
                            <span style="padding: 10px;">/ ${data.sets}</span>
                        </div>
                    </div>
                `).join('')}
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button onclick="app.saveEditedWorkout(${index})">Save</button>
                    <button class="secondary" onclick="app.closeModal()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    saveEditedWorkout(index) {
        const workout = this.workouts[index];
        workout.date = new Date(document.getElementById('edit-date').value).toISOString();
        
        Object.keys(workout.exercises).forEach(key => {
            const weight = parseFloat(document.getElementById(`edit-weight-${key}`).value);
            const completed = parseInt(document.getElementById(`edit-completed-${key}`).value);
            
            workout.exercises[key].weight = weight;
            workout.exercises[key].completed = completed;
        });

        this.saveData();
        this.renderHistory();
        this.closeModal();
    },

    deleteWorkout(index) {
        if (confirm('Delete this workout?')) {
            this.workouts.splice(index, 1);
            this.saveData();
            this.renderHistory();
        }
    },

    closeModal() {
        const modal = document.querySelector('.modal');
        if (modal) modal.remove();
    },

    showSettings() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Settings</h2>
                
                <div class="form-group">
                    <label>Bar Weight (kg)</label>
                    <input type="number" step="0.5" value="${this.settings.barWeight}" id="setting-barWeight">
                </div>

                <div class="form-group">
                    <label>Available Plate Pairs (kg, list all individual plates, comma-separated)</label>
                    <input type="text" value="${this.settings.platePairs.join(', ')}" id="setting-plates">
                    <small>Example: 20, 10, 10, 10, 5, 5, 5, 2.5, 2.5, 1.25, 1.25, 0.5, 0.5</small>
                </div>

                <div class="form-group">
                    <label>Rest Timer (seconds)</label>
                    <input type="number" value="${this.settings.restTimer}" id="setting-restTimer">
                </div>

                <h3>Exercise Increments (kg)</h3>
                ${Object.keys(this.settings.increments).map(key => `
                    <div class="form-group">
                        <label>${this.exercises[key].name}</label>
                        <input type="number" step="0.5" value="${this.settings.increments[key]}" id="setting-increment-${key}">
                    </div>
                `).join('')}

                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button onclick="app.saveSettings()">Save</button>
                    <button class="secondary" onclick="app.closeModal()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    saveSettings() {
        this.settings.barWeight = parseFloat(document.getElementById('setting-barWeight').value);
        this.settings.restTimer = parseInt(document.getElementById('setting-restTimer').value);
        
        // Parse plate pairs
        const platesText = document.getElementById('setting-plates').value;
        this.settings.platePairs = platesText.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p)).sort((a, b) => b - a);

        // Save increments
        Object.keys(this.settings.increments).forEach(key => {
            this.settings.increments[key] = parseFloat(document.getElementById(`setting-increment-${key}`).value);
        });

        this.saveData();
        this.closeModal();
        alert('Settings saved!');
    },

    exportData() {
        const data = {
            exercises: this.exercises,
            workouts: this.workouts,
            settings: this.settings,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `5x5-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    exportCSV() {
        // Create CSV header
        const headers = ['Date', 'Workout Type', 'Exercise', 'Weight (kg)', 'Sets Completed', 'Total Sets'];
        const rows = [headers];

        // Add workout data
        this.workouts.forEach(workout => {
            const date = new Date(workout.date).toLocaleDateString('en-GB');
            const time = new Date(workout.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const dateTime = `${date} ${time}`;

            Object.entries(workout.exercises).forEach(([key, data]) => {
                const exerciseName = this.exercises[key].name;
                rows.push([
                    dateTime,
                    workout.type,
                    exerciseName,
                    data.weight,
                    data.completed,
                    data.sets
                ]);
            });
        });

        // Convert to CSV string
        const csvContent = rows.map(row => 
            row.map(cell => {
                // Escape quotes and wrap in quotes if contains comma
                const cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return '"' + cellStr.replace(/"/g, '""') + '"';
                }
                return cellStr;
            }).join(',')
        ).join('\n');

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `5x5-workouts-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (confirm('This will replace all current data. Continue?')) {
                    this.exercises = data.exercises || this.exercises;
                    this.workouts = data.workouts || [];
                    this.settings = data.settings || this.settings;
                    this.saveData();
                    this.renderHistory();
                    alert('Data imported successfully!');
                }
            } catch (err) {
                alert('Error importing data: ' + err.message);
            }
        };
        reader.readAsText(file);
    }
};

// Initialize app
app.init();
