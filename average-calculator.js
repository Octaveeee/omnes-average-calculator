// ==UserScript==
// @name         Omnes Average Calculator
// @namespace    https://github.com/octavesaveaux/omnes-average-calculator
// @version      1.0
// @description  Calculate the average of the student's grades
// @author       Octave SAVEAUX
// @license      MIT
// @homepageURL     https://github.com/octavesaveaux/omnes-average-calculator
// @match        https://campus-boostcamp.omneseducation.com/myAcademicLife/myGrades
// @match        https://campusonline.inseec.net/note/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/arrive/2.4.1/arrive.min.js
// @grant        none

// ==/UserScript==

(function() {
    'use strict';

    if (window.location.hostname !== 'campusonline.inseec.net') {
        return;
    }

    const CONTAINER_ID = "resultat-note";
    const TABLE_ID = "table_note";
    const DEBOUNCE_DELAY = 300;
    const ACCORDION_DELAY = 600;
    const MUTATION_DELAY = 800;

    const tableObservers = new WeakMap();
    const tableListeners = new WeakMap();
    const attachedContainers = new WeakSet();
    
    let isCalculating = false;
    let calculationTimeout = null;
    let initIntervalId = null;
    let isInitialized = false;

    function parseGradeValue(valueStr) {
        return parseFloat(valueStr.replace(',', '.'));
    }

    function isValidGrade(value, weight) {
        return !isNaN(value) && !isNaN(weight) && value >= 0 && value <= 20 && weight > 0;
    }

    function extractGrades(noteText) {
        if (!noteText || !noteText.trim()) return [];

        const trimmed = noteText.trim();
        const grades = [];

        if (trimmed.includes('(') && trimmed.includes(')')) {
            const parts = trimmed.split(/\s*-\s*/);
            for (const part of parts) {
                const match = part.trim().match(/([\d,]+)\s*\(([\d.]+)%\)/);
                if (match) {
                    const value = parseGradeValue(match[1]);
                    const weight = parseFloat(match[2]);
                    if (isValidGrade(value, weight)) {
                        grades.push({ value, weight });
                    }
                }
            }
        } else {
            const match = trimmed.match(/([\d,]+)/);
            if (match) {
                const value = parseGradeValue(match[1]);
                if (!isNaN(value) && value >= 0 && value <= 20) {
                    grades.push({ value, weight: 100 });
                }
            }
        }

        return grades;
    }

    function getOrCreateOthersModule(modules) {
        if (modules.length === 0 || modules[modules.length - 1].name !== 'Autres') {
            modules.push({ name: 'Autres', courses: [] });
        }
        return modules[modules.length - 1];
    }

    function extractGradesFromTable(table) {
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const extractedData = { modules: [] };

        let currentModule = null;
        let currentCourse = null;
        let currentCourseParts = [];

        for (const row of rows) {
            if (row.style.display === 'none') {
                continue;
            }

            const firstCell = row.querySelector('td.libelle, th.libelle');
            if (!firstCell) continue;

            const cellClasses = firstCell.className;
            const cellText = firstCell.textContent.trim().toUpperCase();

            if (cellClasses.includes('item-ens') && cellText.includes('MODULE')) {
                if (currentModule) {
                    if (currentCourse) {
                        currentCourse.courseParts = currentCourseParts;
                        currentModule.courses.push(currentCourse);
                    }
                    extractedData.modules.push(currentModule);
                }

                currentModule = {
                    name: firstCell.textContent.trim(),
                    courses: []
                };
                currentCourse = null;
                currentCourseParts = [];
            }
            else if (cellClasses.includes('item-fpc')) {
                if (currentCourse) {
                    currentCourse.courseParts = currentCourseParts;
                    if (currentModule) {
                        currentModule.courses.push(currentCourse);
                    } else {
                        const othersModule = getOrCreateOthersModule(extractedData.modules);
                        othersModule.courses.push(currentCourse);
                    }
                }

                const coeffCell = row.querySelector('td.ponderation.item-fpc');
                const coeffText = coeffCell ? coeffCell.textContent.trim() : '';
                const coefficient = coeffText ? parseFloat(coeffText.replace(',', '.')) : 0;

                currentCourse = {
                    name: firstCell.textContent.trim(),
                    coefficient: isNaN(coefficient) ? 0 : coefficient,
                    courseParts: []
                };
                currentCourseParts = [];
            }
            else if (cellClasses.includes('item-ev1') && currentCourse) {
                const noteCell = row.querySelector('td.note.item-ev1:not(.average)');
                const coeffCell = row.querySelector('td.coefficient.item-ev1');
                
                if (noteCell && coeffCell) {
                    const noteText = noteCell.textContent.trim();
                    const coeffText = coeffCell.textContent.trim();
                    
                    if (noteText && !noteText.match(/^(Overall Average|Moyenne Générale)/i)) {
                        const coeffMatch = coeffText.match(/([\d.]+)%/);
                        if (coeffMatch) {
                            const weight = parseFloat(coeffMatch[1]);
                            const grades = extractGrades(noteText);
                            
                            if (grades.length > 0) {
                                currentCourseParts.push({
                                    name: firstCell.textContent.trim(),
                                    weight: weight,
                                    grades: grades
                                });
                            }
                        }
                    }
                }
            }
        }

        if (currentCourse) {
            currentCourse.courseParts = currentCourseParts;
            if (currentModule) {
                currentModule.courses.push(currentCourse);
            } else {
                const othersModule = getOrCreateOthersModule(extractedData.modules);
                othersModule.courses.push(currentCourse);
            }
        }
        if (currentModule) {
            extractedData.modules.push(currentModule);
        }
        
        return extractedData;
    }

    function computeCoursePartAverage(coursePart) {
        if (coursePart.grades.length === 0) {
            coursePart.average = 0;
            return coursePart;
        }

        let totalWeight = 0;
        for (const grade of coursePart.grades) {
            totalWeight += grade.weight;
        }

        if (totalWeight > 0 && Math.abs(totalWeight - 100) > 0.01) {
            coursePart.grades.forEach(function(grade) {
                grade.weight = (grade.weight / totalWeight) * 100;
            });
        }

        coursePart.average = 0;
        let hasValidGrades = false;
        for (const grade of coursePart.grades) {
            if (grade.value == null || isNaN(grade.value)) {
                coursePart.average = undefined;
                return coursePart;
            }
            hasValidGrades = true;
            coursePart.average += grade.value * (grade.weight / 100);
        }
        
        if (hasValidGrades) {
            coursePart.average = Number(coursePart.average.toFixed(2));
        } else {
            coursePart.average = undefined;
        }
        return coursePart;
    }

    function computeCourseAverage(course) {
        course.courseParts.forEach(function(cp) {
            computeCoursePartAverage(cp);
        });

        let totalWeight = 0;
        let partsWithGrades = 0;
        for (const cp of course.courseParts) {
            if (cp.grades.length > 0 && cp.average !== undefined) {
                totalWeight += cp.weight;
                partsWithGrades++;
            }
        }

        if (totalWeight < 100 && totalWeight > 0) {
            course.courseParts.forEach(function(cp) {
                if (cp.grades.length > 0 && cp.average !== undefined) {
                    cp.weight = (cp.weight / totalWeight) * 100;
                } else {
                    cp.weight = 0;
                }
            });
        }

        course.average = 0;
        let availableParts = 0;
        for (const cp of course.courseParts) {
            if (cp.average !== undefined && cp.weight > 0) {
                course.average += cp.average * (cp.weight / 100);
                availableParts++;
            }
        }

        if (availableParts === 0) {
            course.average = undefined;
            course.coefficient = 0;
        } else {
            course.average = Number(course.average.toFixed(2));
        }

        return course;
    }

    function computeModuleAverage(module) {
        let totalWeighted = 0;
        let totalCoeff = 0;

        for (const course of module.courses) {
            const computedCourse = computeCourseAverage(course);
            if (computedCourse.average !== undefined && computedCourse.coefficient > 0) {
                totalWeighted += computedCourse.average * computedCourse.coefficient;
                totalCoeff += computedCourse.coefficient;
            }
        }

        if (totalCoeff > 0) {
            module.average = Number((totalWeighted / totalCoeff).toFixed(2));
        } else {
            module.average = undefined;
        }

        return module;
    }

    function computeAllAverages(extractedData) {
        let totalWeighted = 0;
        let totalCoeff = 0;

        for (const module of extractedData.modules) {
            computeModuleAverage(module);
            
            if (module.average !== undefined) {
                let moduleCoeff = 0;
                for (const course of module.courses) {
                    if (course.average !== undefined && course.coefficient > 0) {
                        moduleCoeff += course.coefficient;
                    }
                }
                if (moduleCoeff > 0) {
                    totalWeighted += module.average * moduleCoeff;
                    totalCoeff += moduleCoeff;
                }
            }
        }

        const overallAverage = totalCoeff > 0 ? Number((totalWeighted / totalCoeff).toFixed(2)) : null;

        return {
            modules: extractedData.modules,
            overallAverage: overallAverage
        };
    }

    function tryShowWhenTableHasRows(table) {
        if (!table) return;

        const tbody = table.querySelector('tbody');
        const rowsCount = tbody ? tbody.querySelectorAll('tr').length : 0;
        if (rowsCount > 0) {
            reExtractAndCalculate(table);
            return true;
        }
        return false;
    }

    function addAverageColumn(table) {
        const thead = table.querySelector('thead');
        if (!thead) return;

        const headerRows = thead.querySelectorAll('tr');
        headerRows.forEach(function(row) {
            if (row.querySelector('th.etudiant')) return;
            if (row.querySelector('th.entete-average')) return;

            const newHeader = document.createElement('th');
            newHeader.className = 'entete-average';
            newHeader.innerHTML = 'Average<br/>Moyenne';
            newHeader.style.cssText = 'width: 117px; text-align: center; border-right: 1px solid #d3d3d3;';
            row.appendChild(newHeader);
        });
    }

    function addAverageCell(row, average, cssClass) {
        let existingCell = row.querySelector('td.average');
        if (existingCell) {
            existingCell.textContent = average !== undefined && average !== null ? average.toFixed(2) : '';
            existingCell.className = 'average ' + (cssClass || '');
            applyAverageStyle(existingCell, cssClass);
            return existingCell;
        }

        const newCell = document.createElement('td');
        newCell.className = 'average ' + (cssClass || '');
        newCell.textContent = average !== undefined && average !== null ? average.toFixed(2) : '';
        applyAverageStyle(newCell, cssClass);
        row.appendChild(newCell);
        return newCell;
    }

    function applyAverageStyle(cell, cssClass) {
        let baseStyle = 'text-align: center; border-right: 1px solid #d3d3d3; max-width: 100px; padding: 8px;';
        
        if (cssClass === 'item-ev1') {
            baseStyle += 'font-weight: 400; background-color: #f5f5f5; color: #424242;';
        } else if (cssClass === 'item-fpc') {
            baseStyle += 'font-weight: 500; background-color: #e0e0e0; color: #212121;';
        } else if (cssClass === 'item-ens') {
            baseStyle += 'font-weight: 600; background-color: #bdbdbd; color: #000000;';
        } else {
            baseStyle += 'font-weight: 400; background-color: #f5f5f5; color: #424242;';
        }
        
        cell.style.cssText = baseStyle;
    }

    function findRowByText(table, text, rowClass) {
        const rows = table.querySelectorAll('tbody tr');
        const searchText = text.trim().toLowerCase();
        
        for (const row of rows) {
            if (row.style.display === 'none') continue;
            
            let firstCell;
            if (rowClass) {
                firstCell = row.querySelector('td.libelle.' + rowClass + ', th.libelle.' + rowClass);
            } else {
                firstCell = row.querySelector('td.libelle, th.libelle');
            }
            
            if (firstCell) {
                const cellText = firstCell.textContent.trim().toLowerCase();
                if (cellText === searchText || cellText.includes(searchText) || searchText.includes(cellText)) {
                    return row;
                }
            }
        }
        return null;
    }

    function findEvaluationRowInCourse(table, courseRow, evaluationName) {
        if (!courseRow) return null;
        
        const allRows = Array.from(table.querySelectorAll('tbody tr'));
        const courseIndex = allRows.indexOf(courseRow);
        if (courseIndex === -1) return null;
        
        const searchText = evaluationName.trim().toLowerCase();
        
        for (let i = courseIndex + 1; i < allRows.length; i++) {
            const row = allRows[i];
            if (row.style.display === 'none') continue;
            
            const firstCell = row.querySelector('td.libelle, th.libelle');
            if (!firstCell) continue;
            
            const cellClasses = firstCell.className;
            
            if (cellClasses.includes('item-fpc') || cellClasses.includes('item-ens')) {
                break;
            }
            
            if (cellClasses.includes('item-ev1')) {
                const cellText = firstCell.textContent.trim().toLowerCase();
                if (cellText === searchText || cellText.includes(searchText) || searchText.includes(cellText)) {
                    return row;
                }
            }
        }
        return null;
    }

    function displayAverages(table, calculatedData) {
        addAverageColumn(table);

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(function(row) {
            if (row.style.display === 'none') return;
            
            const firstCell = row.querySelector('td.libelle, th.libelle');
            if (!firstCell) return;

            const cellClasses = firstCell.className;
            let cssClass = '';
            
            if (cellClasses.includes('item-fpc')) {
                cssClass = 'item-fpc';
            } else if (cellClasses.includes('item-ev1')) {
                cssClass = 'item-ev1';
            } else if (cellClasses.includes('item-ens')) {
                cssClass = 'item-ens';
            }
            
            if (!row.querySelector('td.average')) {
                addAverageCell(row, null, cssClass);
            }
        });

        for (const module of calculatedData.modules) {
            if (module.average !== undefined) {
                const moduleRow = findRowByText(table, module.name, 'item-ens');
                if (moduleRow) {
                    addAverageCell(moduleRow, module.average, 'item-ens');
                }
            }

            for (const course of module.courses) {
                let courseRow = null;
                if (course.average !== undefined) {
                    courseRow = findRowByText(table, course.name, 'item-fpc');
                    if (courseRow) {
                        addAverageCell(courseRow, course.average, 'item-fpc');
                    }
                }

                const hasMultipleEvaluations = course.courseParts.length > 1;
                
                if (hasMultipleEvaluations) {
                    for (const coursePart of course.courseParts) {
                        if (coursePart.average !== undefined && coursePart.average !== null) {
                            let evaluationRow = null;
                            if (courseRow) {
                                evaluationRow = findEvaluationRowInCourse(table, courseRow, coursePart.name);
                            }
                            if (!evaluationRow) {
                                evaluationRow = findRowByText(table, coursePart.name, 'item-ev1');
                            }
                            if (evaluationRow) {
                                addAverageCell(evaluationRow, coursePart.average, 'item-ev1');
                            }
                        }
                    }
                }
            }
        }

        addOverallAverageRow(table, calculatedData.overallAverage);
    }

    function addOverallAverageRow(table, overallAverage) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        const existingRows = tbody.querySelectorAll('tr.omnes-overall-row');
        existingRows.forEach(function(row) {
            row.remove();
        });

        if (overallAverage === null || overallAverage === undefined) {
            return;
        }

        const allRows = Array.from(tbody.querySelectorAll('tr'));
        let lastVisibleRow = null;
        
        for (let i = allRows.length - 1; i >= 0; i--) {
            const row = allRows[i];
            if (row.style.display !== 'none' && !row.classList.contains('omnes-overall-row')) {
                lastVisibleRow = row;
                break;
            }
        }

        if (!lastVisibleRow) {
            return;
        }

        const headerRow = table.querySelector('thead tr:not(:first-child)');
        const columnCount = headerRow ? headerRow.querySelectorAll('th').length : 5;

        const newRow = document.createElement('tr');
        newRow.className = 'omnes-overall-row';
        newRow.style.cssText = 'background-color: #f5f5f5; font-weight: bold;';

        for (let i = 0; i < columnCount; i++) {
            const cell = document.createElement('td');
            
            if (i === 0) {
                cell.textContent = 'Overall Average / Moyenne Générale';
                cell.style.cssText = 'font-weight: bold; padding: 10px; border-right: 1px solid #d3d3d3;';
            } else if (i === columnCount - 1) {
                cell.className = 'average overall-average';
                cell.textContent = overallAverage.toFixed(2);
                cell.style.cssText = 'font-weight: bold; text-align: center; border-right: 1px solid #d3d3d3; padding: 10px; font-size: 16px; background-color: #757575; color: #ffffff;';
            } else {
                cell.style.cssText = 'border-right: 1px solid #d3d3d3;';
            }
            
            newRow.appendChild(cell);
        }

        if (lastVisibleRow.nextSibling) {
            tbody.insertBefore(newRow, lastVisibleRow.nextSibling);
        } else {
            tbody.appendChild(newRow);
        }
    }

    function reExtractAndCalculate(table) {
        if (isCalculating) return;

        if (calculationTimeout) clearTimeout(calculationTimeout);

        calculationTimeout = setTimeout(function() {
            isCalculating = true;
            
            try {
                const extractedData = extractGradesFromTable(table);
                const calculatedData = computeAllAverages(extractedData);
                
                setTimeout(function() {
                    displayAverages(table, calculatedData);
                    isCalculating = false;
                }, 100);
                
                window.localStorage.setItem('omnes-extracted-grades', JSON.stringify(extractedData));
                window.localStorage.setItem('omnes-calculated-data', JSON.stringify(calculatedData));
                if (calculatedData.overallAverage !== null) {
                    window.localStorage.setItem('omnes-overall-average', calculatedData.overallAverage.toString());
                }
            } catch (error) {
                isCalculating = false;
            }
        }, DEBOUNCE_DELAY);
    }

    function setupAccordionListener(table) {
        if (tableObservers.has(table) || tableListeners.has(table)) {
            return;
        }

        const clickHandler = function() {
            setTimeout(function() {
                reExtractAndCalculate(table);
            }, ACCORDION_DELAY);
        };

        const masterRows = table.querySelectorAll('tr.master[toggle-accordeon]');
        masterRows.forEach(function(masterRow) {
            masterRow.addEventListener('click', clickHandler);
        });

        tableListeners.set(table, { masterRows: masterRows, clickHandler: clickHandler });

        const observer = new MutationObserver(function(mutations) {
            let shouldReExtract = false;
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const target = mutation.target;
                    if (target.classList.contains('slave') && target.style.display !== 'none') {
                        shouldReExtract = true;
                        break;
                    }
                }
            }
            if (shouldReExtract) {
                setTimeout(function() {
                    reExtractAndCalculate(table);
                }, MUTATION_DELAY);
            }
        });

        const slaveRows = table.querySelectorAll('tr.slave');
        slaveRows.forEach(function(row) {
            observer.observe(row, {
                attributes: true,
                attributeFilter: ['style']
            });
        });

        tableObservers.set(table, { observer: observer, slaveRows: slaveRows });
    }

    function attachToContainer(container) {
        if (!container || attachedContainers.has(container)) return;
        attachedContainers.add(container);

        const existingTable = container.querySelector('#' + TABLE_ID);
        if (existingTable) {
            if (!tableObservers.has(existingTable)) {
                tryShowWhenTableHasRows(existingTable);
                setupAccordionListener(existingTable);
            }
        }

        if (typeof container.arrive === 'function') {
            container.arrive('#' + TABLE_ID, function(table) {
                if (tableObservers.has(table)) return;
                
                let tries = 0;
                const maxTries = 20;
                const id = setInterval(() => {
                    tries++;
                    if (tryShowWhenTableHasRows(table)) {
                        setupAccordionListener(table);
                        clearInterval(id);
                    }
                    if (tries >= maxTries) clearInterval(id);
                }, 500);
            });
        }
    }

    function init() {
        if (isInitialized) return;
        isInitialized = true;

        const containerNow = document.getElementById(CONTAINER_ID);
        if (containerNow) {
            attachToContainer(containerNow);
        }

        if (typeof document.arrive === 'function') {
            document.arrive('#' + CONTAINER_ID, function(container) {
                attachToContainer(container);
            });
        }

        let attempts = 0;
        const maxAttempts = 60;
        if (initIntervalId) clearInterval(initIntervalId);
        initIntervalId = setInterval(() => {
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(initIntervalId);
                initIntervalId = null;
                return;
            }

            const container = document.getElementById(CONTAINER_ID);
            if (container) {
                attachToContainer(container);
                const table = container.querySelector('#' + TABLE_ID);
                if (table && tableObservers.has(table)) {
                    clearInterval(initIntervalId);
                    initIntervalId = null;
                } else if (table) {
                    tryShowWhenTableHasRows(table);
                }
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
