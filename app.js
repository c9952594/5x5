const app = {
    // Settings (will be loaded from localStorage)
    settings: {
        barWeight: 20,
        platePairs: [20, 20, 10, 5, 2.5, 1.25], // Actual plate pairs available
        restTimer: 180, // seconds
        exerciseCountdown: 5, // seconds countdown before exercise timer starts
        githubToken: '',
        gistId: '',
    },

    // Exercise library - all available exercises
    exercises: {
        squat: { name: 'Squat', type: 'weight', defaultWeight: 60, increment: 2.5, sets: 5 },
        bench: { name: 'Bench Press', type: 'weight', defaultWeight: 40, increment: 2.5, sets: 5 },
        row: { name: 'Barbell Row', type: 'weight', defaultWeight: 40, increment: 2.5, sets: 5 },
        ohp: { name: 'Overhead Press', type: 'weight', defaultWeight: 30, increment: 2.5, sets: 5 },
        deadlift: { name: 'Deadlift', type: 'weight', defaultWeight: 60, increment: 5, sets: 1 }
    },

    // Workout templates - configurable workout routines
    workoutTemplates: {
        A: {
            name: 'Workout A',
            exercises: ['squat', 'bench', 'row']
        },
        B: {
            name: 'Workout B',
            exercises: ['squat', 'ohp', 'deadlift']
        }
    },

    workouts: [],
    currentWorkout: null,
    restTimerInterval: null,
    restTimerEnd: null,
    exerciseTimerInterval: null,
    exerciseTimerEnd: null,
    activeExerciseTimer: null,
    lastSyncedWorkoutCount: 0,

    init() {
        this.loadData();
        this.renderHistory();
        this.updateSyncBadge();
        
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
            this.workoutTemplates = data.workoutTemplates || this.workoutTemplates;
            this.workouts = data.workouts || [];
            this.settings = data.settings || this.settings;
            this.lastSyncedWorkoutCount = data.lastSyncedWorkoutCount || 0;
        }
    },

    saveData() {
        localStorage.setItem('5x5-data', JSON.stringify({
            exercises: this.exercises,
            workoutTemplates: this.workoutTemplates,
            workouts: this.workouts,
            settings: this.settings,
            lastSyncedWorkoutCount: this.lastSyncedWorkoutCount
        }));
    },

    showNewWorkout() {
        document.getElementById('workoutForm').classList.remove('hidden');
        
        // Auto-select next workout type based on last workout
        const lastWorkout = this.workouts[0];
        const templateKeys = Object.keys(this.workoutTemplates);
        if (lastWorkout && templateKeys.length > 0) {
            const lastIndex = templateKeys.indexOf(lastWorkout.type);
            const nextIndex = (lastIndex + 1) % templateKeys.length;
            document.getElementById('workoutType').value = templateKeys[nextIndex];
        } else if (templateKeys.length > 0) {
            document.getElementById('workoutType').value = templateKeys[0];
        }
        
        this.populateWorkoutTypeDropdown();
        this.selectWorkoutType();
    },

    populateWorkoutTypeDropdown() {
        const select = document.getElementById('workoutType');
        const currentValue = select.value;
        
        select.innerHTML = '<option value="">Select workout...</option>';
        Object.entries(this.workoutTemplates).forEach(([key, template]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${template.name} (${template.exercises.map(id => this.exercises[id].name).join(', ')})`;
            select.appendChild(option);
        });
        
        if (currentValue) {
            select.value = currentValue;
        }
    },

    selectWorkoutType() {
        const type = document.getElementById('workoutType').value;
        const grid = document.getElementById('exerciseGrid');
        
        if (!type || !this.workoutTemplates[type]) {
            grid.innerHTML = '';
            return;
        }

        const template = this.workoutTemplates[type];
        const exerciseList = template.exercises;

        this.currentWorkout = {
            date: new Date().toISOString(),
            type: type,
            exercises: {}
        };

        grid.innerHTML = exerciseList.map(key => {
            const ex = this.exercises[key];
            if (!ex) return '';
            
            const sets = ex.sets || 5;
            const isTimeBased = ex.type === 'time';
            
            if (isTimeBased) {
                const duration = this.calculateNextDuration(key);
                return `
                    <div class="exercise-item">
                        <div class="exercise-header">
                            <span class="exercise-name">${ex.name}</span>
                        </div>
                        <div class="weight-input">
                            <label>Duration (seconds):</label>
                            <input type="number" step="5" value="${duration}" 
                                   id="duration-${key}">
                        </div>
                        <div class="sets-display">
                            ${Array.from({length: sets}, (_, i) => `
                                <input type="checkbox" id="set-${key}-${i}" 
                                       onchange="app.handleSetCheck('${key}', ${i})">
                            `).join('')}
                        </div>
                        <div class="timer-controls">
                            <button class="small-btn" onclick="app.startExerciseTimer('${key}')">Start Timer</button>
                            <button class="small-btn" onclick="app.stopExerciseTimer()">Stop</button>
                        </div>
                        <div class="timer-display" id="exercise-timer-${key}"></div>
                        <div class="timer-display" id="timer-${key}"></div>
                    </div>
                `;
            } else {
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
            }
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
        const exercise = this.exercises[exerciseKey];
        if (!exercise) return 20;
        
        // Get last 3 workouts for this exercise
        const recentWorkouts = this.workouts
            .filter(w => w.exercises[exerciseKey])
            .slice(0, 3);

        if (recentWorkouts.length === 0) {
            return exercise.defaultWeight || 20;
        }

        const lastWorkout = recentWorkouts[0];
        const lastData = lastWorkout.exercises[exerciseKey];
        const increment = exercise.increment || 2.5;

        // Check if all sets were completed
        if (lastData.completed === lastData.sets) {
            // Success - increase weight
            return lastData.weight + increment;
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

    calculateNextDuration(exerciseKey) {
        const exercise = this.exercises[exerciseKey];
        if (!exercise) return 60;
        
        // Get last 3 workouts for this exercise
        const recentWorkouts = this.workouts
            .filter(w => w.exercises[exerciseKey])
            .slice(0, 3);

        if (recentWorkouts.length === 0) {
            return exercise.duration || 60;
        }

        const lastWorkout = recentWorkouts[0];
        const lastData = lastWorkout.exercises[exerciseKey];
        const increment = exercise.increment || 5;

        // Check if all sets were completed
        if (lastData.completed === lastData.sets) {
            // Success - increase duration
            return lastData.duration + increment;
        } else if (recentWorkouts.length === 3 && 
                   recentWorkouts.every(w => w.exercises[exerciseKey].completed < w.exercises[exerciseKey].sets)) {
            // Failed 3 times in a row - decrease by 10%
            const newDuration = Math.round(lastData.duration * 0.9);
            return Math.max(10, newDuration); // Minimum 10 seconds
        } else {
            // Keep same duration
            return lastData.duration;
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
        // Create a distinctive 3-tone jingle that cuts through music
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);

        // Three-tone ascending jingle: C5 -> E5 -> G5 (major chord)
        const notes = [
            { freq: 523.25, start: 0, duration: 0.15 },      // C5
            { freq: 659.25, start: 0.15, duration: 0.15 },   // E5
            { freq: 783.99, start: 0.30, duration: 0.25 }    // G5 (longer final note)
        ];

        notes.forEach(note => {
            const osc = audioContext.createOscillator();
            const noteGain = audioContext.createGain();
            
            osc.connect(noteGain);
            noteGain.connect(gainNode);
            
            osc.frequency.value = note.freq;
            osc.type = 'sine';
            
            // Louder volume (0.5) with quick attack and decay
            const startTime = audioContext.currentTime + note.start;
            noteGain.gain.setValueAtTime(0, startTime);
            noteGain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
            noteGain.gain.exponentialRampToValueAtTime(0.01, startTime + note.duration);
            
            osc.start(startTime);
            osc.stop(startTime + note.duration);
        });
    },

    playCountdownBeep(isLast = false) {
        // Short beep for countdown (4 short beeps), or long beep for final countdown
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = isLast ? 880 : 440; // Higher pitch for final beep
        oscillator.type = 'sine';

        const duration = isLast ? 0.5 : 0.1; // Longer final beep
        const startTime = audioContext.currentTime;
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.4, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    },

    startExerciseTimer(exerciseKey) {
        // Stop any existing exercise timer
        this.stopExerciseTimer();

        const durationInput = document.getElementById(`duration-${exerciseKey}`);
        const duration = parseInt(durationInput.value);
        const timerDisplay = document.getElementById(`exercise-timer-${exerciseKey}`);
        const countdownSeconds = this.settings.exerciseCountdown || 5;
        
        this.activeExerciseTimer = exerciseKey;
        
        // Start countdown phase
        let countdown = countdownSeconds;
        timerDisplay.innerHTML = `<div class="exercise-timer countdown-timer">
            Get ready: <span id="exercise-countdown">${countdown}</span>
        </div>`;
        
        const countdownInterval = setInterval(() => {
            countdown--;
            const countdownEl = document.getElementById('exercise-countdown');
            
            if (countdownEl) {
                countdownEl.textContent = countdown;
            }
            
            if (countdown > 0) {
                this.playCountdownBeep(false); // Short beep
            } else {
                clearInterval(countdownInterval);
                this.playCountdownBeep(true); // Long beep to start
                
                // Start actual exercise timer
                this.exerciseTimerEnd = Date.now() + (duration * 1000);
                
                timerDisplay.innerHTML = `<div class="exercise-timer">
                    <span id="exercise-countdown">${this.formatTime(duration)}</span>
                </div>`;

                this.exerciseTimerInterval = setInterval(() => {
                    const remaining = Math.max(0, Math.ceil((this.exerciseTimerEnd - Date.now()) / 1000));
                    const countdownDisplay = document.getElementById('exercise-countdown');
                    
                    if (countdownDisplay) {
                        countdownDisplay.textContent = this.formatTime(remaining);
                    }

                    if (remaining === 0) {
                        this.playSound();
                        this.stopExerciseTimer();
                        timerDisplay.innerHTML = '<div class="timer-complete">Time complete!</div>';
                        setTimeout(() => {
                            timerDisplay.innerHTML = '';
                        }, 3000);
                    }
                }, 100);
            }
        }, 1000);
    },

    stopExerciseTimer() {
        if (this.exerciseTimerInterval) {
            clearInterval(this.exerciseTimerInterval);
            this.exerciseTimerInterval = null;
            this.exerciseTimerEnd = null;
            
            if (this.activeExerciseTimer) {
                const timerDisplay = document.getElementById(`exercise-timer-${this.activeExerciseTimer}`);
                if (timerDisplay) {
                    timerDisplay.innerHTML = '';
                }
                this.activeExerciseTimer = null;
            }
        }
    },

    saveWorkout() {
        const type = document.getElementById('workoutType').value;
        if (!type || !this.workoutTemplates[type]) return;

        const template = this.workoutTemplates[type];
        const exerciseList = template.exercises;

        this.currentWorkout.exercises = {};

        exerciseList.forEach(key => {
            const ex = this.exercises[key];
            if (!ex) return;
            
            const sets = ex.sets || 5;
            const completedSets = Array.from({length: sets}, (_, i) => 
                document.getElementById(`set-${key}-${i}`).checked
            ).filter(Boolean).length;

            if (ex.type === 'time') {
                const duration = parseInt(document.getElementById(`duration-${key}`).value);
                this.currentWorkout.exercises[key] = {
                    duration: duration,
                    sets: sets,
                    completed: completedSets
                };
            } else {
                const weight = parseFloat(document.getElementById(`weight-${key}`).value);
                this.currentWorkout.exercises[key] = {
                    weight: weight,
                    sets: sets,
                    completed: completedSets
                };
            }
        });

        this.workouts.unshift(this.currentWorkout);
        this.saveData();
        this.markAsUnsynced();
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
        this.stopExerciseTimer();
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
                const exercise = this.exercises[key];
                const name = exercise ? exercise.name : key;
                
                if (data.duration !== undefined) {
                    // Time-based exercise
                    return `<div class="workout-exercise">
                        ${name}: ${data.duration}s - ${data.completed}/${data.sets} sets
                    </div>`;
                } else {
                    // Weight-based exercise
                    return `<div class="workout-exercise">
                        ${name}: ${data.weight}kg - ${data.completed}/${data.sets} sets
                    </div>`;
                }
            }).join('');

            const template = this.workoutTemplates[workout.type];
            const workoutName = template ? template.name : `Workout ${workout.type}`;

            return `
                <div class="workout-card">
                    <div class="workout-header">
                        <div class="workout-date">${date} - ${workoutName}</div>
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
            <div class="modal-content settings-modal">
                <h2>Settings</h2>
                
                <div class="settings-tabs">
                    <button class="tab-btn active" onclick="app.switchTab('general')">General</button>
                    <button class="tab-btn" onclick="app.switchTab('exercises')">Exercises</button>
                    <button class="tab-btn" onclick="app.switchTab('workouts')">Workouts</button>
                </div>

                <div id="settings-general" class="settings-tab active">
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

                    <div class="form-group">
                        <label>Exercise Countdown (seconds)</label>
                        <input type="number" value="${this.settings.exerciseCountdown || 5}" id="setting-exerciseCountdown">
                        <small>Countdown before timed exercises start (e.g., time to grip the bar for hanging)</small>
                    </div>

                    <div class="form-group github-setup">
                        <h3>☁️ Cloud Sync Setup</h3>
                        <p>To sync your workout data across devices using GitHub:</p>
                        <ol>
                            <li><strong>Create a GitHub account</strong> (if you don't have one): <a href="https://github.com/signup" target="_blank">github.com/signup</a></li>
                            <li><strong>Generate a Personal Access Token</strong>:
                                <ul>
                                    <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank">github.com/settings/tokens/new</a></li>
                                    <li>Note: "5x5 Workout Sync"</li>
                                    <li>Expiration: 90 days (or No expiration)</li>
                                    <li>Select scope: <strong>✓ gist</strong> (only this one!)</li>
                                    <li>Click "Generate token"</li>
                                    <li>Copy the token (starts with "ghp_...")</li>
                                </ul>
                            </li>
                            <li>Paste your token below (gist selector will appear)</li>
                            <li><strong>Primary Device:</strong> Select "Create new backup" and click "Backup to Cloud"</li>
                            <li><strong>Other Devices:</strong> Enter same token, select the existing backup from the dropdown, then "Restore from Cloud"</li>
                        </ol>
                        <label>GitHub Personal Access Token</label>
                        <input type="password" value="${this.settings.githubToken || ''}" id="setting-githubToken" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" onchange="app.onTokenChange()">
                        <small>Your token is stored locally and never shared. It's only used to sync YOUR data to YOUR GitHub account.</small>
                        
                        <div id="gist-selector" class="gist-selector" style="display: none; margin-top: 20px;">
                            <label>Select Gist to Sync With</label>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <select id="setting-gistId" style="flex: 1;">
                                    <option value="">Create new backup...</option>
                                </select>
                                <button type="button" class="secondary icon-btn" onclick="app.loadGists()" title="Refresh gist list">🔄</button>
                            </div>
                            <small>Select an existing gist to share data across devices, or create a new one from your primary device.</small>
                        </div>
                    </div>
                </div>

                <div id="settings-exercises" class="settings-tab">
                    <div id="exercises-list"></div>
                    <button class="secondary" onclick="app.addExercise()">+ Add Exercise</button>
                </div>

                <div id="settings-workouts" class="settings-tab">
                    <div id="workouts-list"></div>
                    <button class="secondary" onclick="app.addWorkoutTemplate()">+ Add Workout</button>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button onclick="app.saveSettings()">Save</button>
                    <button class="secondary" onclick="app.closeModal()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.renderExercisesList();
        this.renderWorkoutsList();
        
        // Show gist selector if token exists
        if (this.settings.githubToken) {
            this.onTokenChange();
        }
    },

    switchTab(tabName) {
        document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`settings-${tabName}`).classList.add('active');
        event.target.classList.add('active');
    },

    renderExercisesList() {
        const container = document.getElementById('exercises-list');
        container.innerHTML = Object.entries(this.exercises).map(([id, ex]) => {
            const isTimeBased = ex.type === 'time';
            return `
                <div class="exercise-config" data-id="${id}">
                    <input type="text" value="${ex.name}" placeholder="Exercise Name" data-field="name" class="exercise-field">
                    <select data-field="type" class="exercise-field" onchange="app.toggleExerciseType('${id}', this.value)">
                        <option value="weight" ${!isTimeBased ? 'selected' : ''}>Weight-based</option>
                        <option value="time" ${isTimeBased ? 'selected' : ''}>Time-based</option>
                    </select>
                    <div class="exercise-type-fields" id="fields-${id}">
                        ${isTimeBased ? `
                            <input type="number" value="${ex.duration || 60}" placeholder="Duration (sec)" data-field="duration" class="exercise-field">
                            <input type="number" step="5" value="${ex.increment || 5}" placeholder="Increment (sec)" data-field="increment" class="exercise-field">
                        ` : `
                            <input type="number" step="2.5" value="${ex.defaultWeight || 20}" placeholder="Default Weight" data-field="defaultWeight" class="exercise-field">
                            <input type="number" step="0.5" value="${ex.increment || 2.5}" placeholder="Increment" data-field="increment" class="exercise-field">
                        `}
                    </div>
                    <input type="number" value="${ex.sets}" placeholder="Sets" data-field="sets" class="exercise-field">
                    <button class="icon-btn" onclick="app.deleteExercise('${id}')" title="Delete">🗑️</button>
                </div>
            `;
        }).join('');
    },

    toggleExerciseType(id, type) {
        this.exercises[id].type = type;
        this.renderExercisesList();
    },

    renderWorkoutsList() {
        const container = document.getElementById('workouts-list');
        container.innerHTML = Object.entries(this.workoutTemplates).map(([id, template]) => `
            <div class="workout-config" data-id="${id}">
                <input type="text" value="${template.name}" placeholder="Workout Name" data-field="name" class="workout-name-field">
                <div class="exercise-checkboxes">
                    ${Object.entries(this.exercises).map(([exId, ex]) => `
                        <label>
                            <input type="checkbox" value="${exId}" 
                                   ${template.exercises.includes(exId) ? 'checked' : ''}
                                   onchange="app.updateWorkoutExercises('${id}')">
                            ${ex.name}
                        </label>
                    `).join('')}
                </div>
                <button class="icon-btn" onclick="app.deleteWorkoutTemplate('${id}')" title="Delete">🗑️</button>
            </div>
        `).join('');
    },

    updateWorkoutExercises(workoutId) {
        const container = document.querySelector(`.workout-config[data-id="${workoutId}"] .exercise-checkboxes`);
        const selected = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        this.workoutTemplates[workoutId].exercises = selected;
    },

    addExercise() {
        const id = 'ex_' + Date.now();
        this.exercises[id] = {
            name: 'New Exercise',
            type: 'weight',
            defaultWeight: 20,
            increment: 2.5,
            sets: 5
        };
        this.renderExercisesList();
        this.renderWorkoutsList();
    },

    deleteExercise(id) {
        if (confirm(`Delete ${this.exercises[id].name}?`)) {
            delete this.exercises[id];
            // Remove from workout templates
            Object.values(this.workoutTemplates).forEach(template => {
                template.exercises = template.exercises.filter(exId => exId !== id);
            });
            this.renderExercisesList();
            this.renderWorkoutsList();
        }
    },

    addWorkoutTemplate() {
        const id = String.fromCharCode(65 + Object.keys(this.workoutTemplates).length); // A, B, C, etc
        this.workoutTemplates[id] = {
            name: `Workout ${id}`,
            exercises: []
        };
        this.renderWorkoutsList();
    },

    deleteWorkoutTemplate(id) {
        if (confirm(`Delete ${this.workoutTemplates[id].name}?`)) {
            delete this.workoutTemplates[id];
            this.renderWorkoutsList();
        }
    },

    saveSettings() {
        this.settings.barWeight = parseFloat(document.getElementById('setting-barWeight').value);
        this.settings.restTimer = parseInt(document.getElementById('setting-restTimer').value);
        this.settings.exerciseCountdown = parseInt(document.getElementById('setting-exerciseCountdown').value);
        this.settings.githubToken = document.getElementById('setting-githubToken').value.trim();
        
        // Save selected gist ID
        const gistSelect = document.getElementById('setting-gistId');
        if (gistSelect) {
            this.settings.gistId = gistSelect.value;
        }
        
        // Parse plate pairs
        const platesText = document.getElementById('setting-plates').value;
        this.settings.platePairs = platesText.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p)).sort((a, b) => b - a);

        // Save exercise configurations
        document.querySelectorAll('.exercise-config').forEach(div => {
            const id = div.dataset.id;
            const exercise = this.exercises[id];
            
            // Clear old fields
            delete exercise.defaultWeight;
            delete exercise.duration;
            
            div.querySelectorAll('.exercise-field, select[data-field]').forEach(input => {
                const field = input.dataset.field;
                let value = input.value;
                if (field === 'name' || field === 'type') {
                    exercise[field] = value;
                } else if (field) {
                    exercise[field] = parseFloat(value);
                }
            });
        });

        // Save workout template names
        document.querySelectorAll('.workout-config').forEach(div => {
            const id = div.dataset.id;
            const nameField = div.querySelector('.workout-name-field');
            this.workoutTemplates[id].name = nameField.value;
        });

        this.saveData();
        this.closeModal();
        alert('Settings saved!');
    },

    exportData() {
        const data = {
            exercises: this.exercises,
            workoutTemplates: this.workoutTemplates,
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
        const headers = ['Date', 'Workout Type', 'Exercise', 'Weight (kg)', 'Duration (s)', 'Sets Completed', 'Total Sets'];
        const rows = [headers];

        // Add workout data
        this.workouts.forEach(workout => {
            const date = new Date(workout.date).toLocaleDateString('en-GB');
            const time = new Date(workout.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            const dateTime = `${date} ${time}`;

            Object.entries(workout.exercises).forEach(([key, data]) => {
                const exercise = this.exercises[key];
                const exerciseName = exercise ? exercise.name : key;
                rows.push([
                    dateTime,
                    workout.type,
                    exerciseName,
                    data.weight || '',
                    data.duration || '',
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
                    this.workoutTemplates = data.workoutTemplates || this.workoutTemplates;
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
    },

    // GitHub Gist Sync Functions
    async onTokenChange() {
        const token = document.getElementById('setting-githubToken').value.trim();
        const gistSelector = document.getElementById('gist-selector');
        
        if (token && gistSelector) {
            gistSelector.style.display = 'block';
            await this.loadGists();
        } else if (gistSelector) {
            gistSelector.style.display = 'none';
        }
    },

    async loadGists() {
        const token = document.getElementById('setting-githubToken').value.trim();
        if (!token) return;

        const select = document.getElementById('setting-gistId');
        if (!select) return;

        try {
            const response = await fetch('https://api.github.com/gists', {
                headers: {
                    'Authorization': `token ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load gists');
            }

            const gists = await response.json();
            
            // Filter for 5x5 workout gists
            const workoutGists = gists.filter(g => 
                g.description === '5x5 Workout Tracker Data' || 
                g.files['5x5-data.json']
            );

            // Populate dropdown
            select.innerHTML = '<option value="">Create new backup...</option>';
            workoutGists.forEach(gist => {
                const option = document.createElement('option');
                option.value = gist.id;
                const date = new Date(gist.updated_at).toLocaleString();
                option.textContent = `Backup from ${date} (${gist.id.substring(0, 8)}...)`;
                if (gist.id === this.settings.gistId) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            if (workoutGists.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No backups found - create your first one!';
                option.disabled = true;
                select.appendChild(option);
            }
        } catch (err) {
            console.error('Error loading gists:', err);
            alert('Could not load gists. Please check your token has "gist" permissions.');
        }
    },
    
    async syncToGist() {
        if (!this.settings.githubToken) {
            alert('Please configure your GitHub token in Settings → General first.');
            return;
        }

        try {
            const data = {
                exercises: this.exercises,
                workoutTemplates: this.workoutTemplates,
                workouts: this.workouts,
                settings: { ...this.settings, githubToken: undefined }, // Don't sync token
                lastSync: new Date().toISOString()
            };

            const gistData = {
                description: '5x5 Workout Tracker Data',
                public: false,
                files: {
                    '5x5-data.json': {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            };

            let response;
            if (this.settings.gistId) {
                // Update existing gist
                response = await fetch(`https://api.github.com/gists/${this.settings.gistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `token ${this.settings.githubToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(gistData)
                });
            } else {
                // Create new gist
                response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${this.settings.githubToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(gistData)
                });
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to sync to GitHub');
            }

            const result = await response.json();
            this.settings.gistId = result.id;
            
            // Update synced workout count
            this.lastSyncedWorkoutCount = this.workouts.length;
            this.saveData();
            
            // Update badge
            this.updateSyncBadge();
            
            alert('✓ Backup successful! Your data is synced to GitHub.');
        } catch (err) {
            alert('Backup failed: ' + err.message + '\n\nPlease check your token has "gist" permissions.');
        }
    },

    async syncFromGist() {
        if (!this.settings.githubToken) {
            alert('Please configure your GitHub token in Settings → General first.');
            return;
        }

        if (!this.settings.gistId) {
            alert('No cloud backup found. Please use "Backup to Cloud" first from your primary device.');
            return;
        }

        try {
            const response = await fetch(`https://api.github.com/gists/${this.settings.gistId}`, {
                headers: {
                    'Authorization': `token ${this.settings.githubToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch backup from GitHub');
            }

            const gist = await response.json();
            const fileContent = gist.files['5x5-data.json'].content;
            const cloudData = JSON.parse(fileContent);

            // Merge data intelligently
            const merged = this.mergeWorkoutData(cloudData);

            if (confirm(`Found cloud backup from ${new Date(cloudData.lastSync).toLocaleString()}.\n\nMerge with local data? This will combine workouts from both sources.`)) {
                this.exercises = merged.exercises;
                this.workoutTemplates = merged.workoutTemplates;
                this.workouts = merged.workouts;
                
                // Merge settings: use cloud settings but preserve local token and gistId
                const localToken = this.settings.githubToken;
                const localGistId = this.settings.gistId;
                this.settings = { ...cloudData.settings };
                this.settings.githubToken = localToken;
                this.settings.gistId = localGistId || cloudData.settings?.gistId;
                
                // Update synced workout count
                this.lastSyncedWorkoutCount = this.workouts.length;
                this.saveData();
                this.renderHistory();
                
                // Update badge
                this.updateSyncBadge();
                
                alert('✓ Restore successful! Data merged from cloud.');
            }
        } catch (err) {
            alert('Restore failed: ' + err.message);
        }
    },

    mergeWorkoutData(cloudData) {
        // Merge workouts by date, keeping most recent version of each
        const workoutMap = new Map();
        
        // Add local workouts
        this.workouts.forEach(w => {
            workoutMap.set(w.date, w);
        });
        
        // Add/update with cloud workouts (cloud wins on conflicts)
        cloudData.workouts.forEach(w => {
            workoutMap.set(w.date, w);
        });
        
        // Sort by date descending
        const mergedWorkouts = Array.from(workoutMap.values())
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        // Merge exercises (combine both sets, cloud wins on name conflicts)
        const mergedExercises = { ...this.exercises };
        Object.entries(cloudData.exercises || {}).forEach(([id, ex]) => {
            mergedExercises[id] = ex;
        });

        // Merge workout templates (combine both sets, cloud wins on conflicts)
        const mergedTemplates = { ...this.workoutTemplates };
        Object.entries(cloudData.workoutTemplates || {}).forEach(([id, template]) => {
            mergedTemplates[id] = template;
        });

        return {
            exercises: mergedExercises,
            workoutTemplates: mergedTemplates,
            workouts: mergedWorkouts
        };
    },

    updateSyncBadge() {
        const badge = document.getElementById('unsyncedBadge');
        if (!badge) return;
        
        // Show badge only if:
        // 1. User has a token configured (sync is set up)
        // 2. There are new workouts since last sync
        const hasSyncSetup = this.settings.githubToken && this.settings.githubToken.length > 0;
        const hasUnsyncedWorkouts = this.workouts.length > this.lastSyncedWorkoutCount;
        
        if (hasSyncSetup && hasUnsyncedWorkouts) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    markAsUnsynced() {
        this.updateSyncBadge();
    }
};

// Initialize app
app.init();
