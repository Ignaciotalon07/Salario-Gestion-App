// ════════════════════════════════════
// GRÁFICOS (Chart.js)
// Tres gráficos: tendencia mensual (línea), consultas por cliente (barras),
// y consultas por asesor (barras).
// Se inicializan al terminar de cargar la página.
// ════════════════════════════════════

window.addEventListener('load', () => {
  // Tendencia mensual — total vs repetidas
  new Chart(document.getElementById('chartTend'), {
    type: 'line',
    data: {
      labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May'],
      datasets: [
        { label: 'Total', data: [38, 42, 35, 47, 47], borderColor: '#2d2d8e', backgroundColor: 'transparent', tension: .35, pointRadius: 4, pointBackgroundColor: '#2d2d8e', borderWidth: 2 },
        { label: 'Repetidas', data: [14, 18, 12, 16, 16], borderColor: '#c0392b', backgroundColor: 'transparent', tension: .35, borderDash: [5, 4], pointRadius: 4, pointBackgroundColor: '#c0392b', borderWidth: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9e9e99', font: { size: 11 } } },
        x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 } } }
      }
    }
  });

  // Consultas por cliente este mes
  new Chart(document.getElementById('chartClientes'), {
    type: 'bar',
    data: {
      labels: ['Nina', 'Noetinger', 'Mark Twain', 'ESTIN', 'Zarazaga', 'Bocco', 'Taborin', 'Ispova', 'Sartori', 'm3'],
      datasets: [{
        label: 'Consultas',
        data: [9, 8, 7, 6, 5, 5, 3, 2, 2, 1],
        backgroundColor: ['#2d2d8e', '#1a5fa5', '#1a5fa5', '#2d2d8e', '#2d2d8e', '#2d2d8e', '#2d2d8e', '#2d2d8e', '#2d2d8e', '#2d2d8e'],
        borderRadius: 5,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9e9e99', font: { size: 11 }, stepSize: 2 } },
        x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 }, maxRotation: 35 } }
      }
    }
  });

  // Consultas por asesor
  new Chart(document.getElementById('chartEquipo'), {
    type: 'bar',
    data: {
      labels: ['Ignacio', 'Matías', 'Daniel', 'Renzo'],
      datasets: [{
        data: [18, 12, 9, 8],
        backgroundColor: ['#c0392b', '#2d6a2d', '#b45309', '#1a5fa5'],
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#9e9e99', font: { size: 11 }, stepSize: 5 } },
        x: { grid: { display: false }, ticks: { color: '#9e9e99', font: { size: 11 } } }
      }
    }
  });

  // Base de soluciones: el render inicial lo hace js/kb.js cargando desde Supabase.
});
