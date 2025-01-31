---
# the default layout is 'page'
icon: fas fa-info-circle
order: 1
---
<style>

/* Skills Grid Layout and Styling */
/* Skills Grid Layout and Styling */
/* Skills Grid Layout and Styling */
/* Skills Grid Layout and Styling */
.skills-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 15px;
    padding: 20px;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
}

.skill-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 15px;
    border-radius: 10px;
    transition: all 0.3s ease;
    aspect-ratio: 1 / 1;
    overflow: hidden;
}


.skill-item:hover {
    transform: scale(1.1);
    box-shadow: 0 0 15px rgba(0, 0, 0, 0.2);
}

/* Pastel colors for group1 */
.skills-grid .group1 {
    background-color: rgba(173, 216, 230, 0.3);  /* Pastel Blue */
    border: 1px solid rgba(173, 216, 230, 0.5);
}

/* Pastel colors for group2 */
.skills-grid .group2 {
    background-color: rgba(255, 182, 193, 0.3);  /* Pastel Pink */
    border: 1px solid rgba(255, 182, 193, 0.5);
}

.skill-item .skill-icon {
    font-size: min(28px, 2.8vw);
    margin-bottom: 10px;
    color: rgba(0, 0, 0, 0.7);
}

.skill-item p {
    font-size: min(16px, 1.4vw);
    margin: 0;
    word-wrap: normal;
    word-break: keep-all;
    hyphens: auto;
    max-width: 100%;
    line-height: 1.2;
}

/* Responsive adjustments */
@media screen and (max-width: 768px) {
    .skills-grid {
        grid-template-columns: repeat(3, 1fr);
    }
    
    .skill-item .skill-icon {
        font-size: min(24px, 4.5vw);
    }
    
    .skill-item p {
        font-size: min(14px, 2.2vw);
    }
}

@media screen and (max-width: 480px) {
    .skills-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .skill-item .skill-icon {
        font-size: min(22px, 6vw);
    }
    
    .skill-item p {
        font-size: min(12px, 2.7vw);
    }
}


</style>

Hi there! I’m a computational scientist and researcher with a passion and expertise for solving complex problems at the intersection of **machine learning**, **computational chemistry**, and **materials science**. 

As a **Staff Scientist** at **Los Alamos National Laboratory** I focus on:  
- ML interatomic potentials  
- Active learning for chemical data generation 
- GPU-enabled PyTorch modules for excited-state simulations  
- Deploying/optimizing HPC applications and consulting users  

I’m also fascinated by new tech, productivity/ergonomics tools and hacks and scientific visualization. Whether it’s assembling hardware, writing the code or testing new LLMs, I like finding smarter and smoother ways to work.

---

## Skills

<!-- HTML Skills Grid -->
<div class="skills-grid">
  <!-- First Row (group1) -->
  <div class="skill-item group1">
    <i class="fas fa-network-wired skill-icon"></i>
    <p>High-Performance<br>Computing</p>
  </div>

  <div class="skill-item group1">
    <i class="fas fa-atom skill-icon"></i>
    <p>Computational<br>Chemistry</p>
  </div>

  <div class="skill-item group1">
    <i class="fas fa-brain skill-icon"></i>
    <p>Machine<br>Learning<br>Workflows</p>
  </div>

  <div class="skill-item group1">
    <i class="fas fa-chart-area skill-icon"></i>
    <p>Scientific<br>Visualization</p>
  </div>

  <div class="skill-item group1">
    <i class="fas fa-tasks skill-icon"></i>
    <p>Project &<br>Conference Management</p>
  </div>

  <!-- Second Row (group2) -->
  <div class="skill-item group2">
    <i class="fab fa-python skill-icon"></i>
    <p>Python<br>PyTorch</p>
  </div>

<div class="skill-item group2">
  <i class="fas fa-calculator skill-icon"></i>
  <p>ORCA<br>Gaussian<br>VASP</p>
</div>

  <div class="skill-item group2">
    <i class="fas fa-terminal skill-icon"></i>
    <p>Linux<br>Windows<br>Shells</p>
  </div>

  <div class="skill-item group2">
    <i class="fas fa-code-branch skill-icon"></i>
    <p>Git<br>Docs<br>Sphinx</p>
  </div>

  <div class="skill-item group2">
    <i class="fas fa-bookmark skill-icon"></i>
    <p>Notion<br>TickTick<br>Obsidian</p>
  </div>
</div>

---

## Work Experience

### Staff Scientist  | Los Alamos National Laboratory (LANL) | 2024–Present  
- Developing PyTorch modules for excited-state simulations  
- Maintenance of HPC applications and user consulting  
- Active Learning Framework (ALF) integration with HPC systems  
- Lead organizer of MLCM conference series  

### Director’s Postdoctoral Fellow | LANL | 2022–2024  
- GPU implementation of Davidson diagonalization for matrix-free methods  
- Benchmarking transition path sampling using ML models  
- Dataset generation and active learning workflows  

### Research Assistant  | LANL & Utah State University | 2020–2022  
- Machine learning parameterization of semi-empirical models  
- Long-range electrostatics in ML interatomic potentials  
- Generating datasets for training predictive models  

### Research Assistant  | Utah State University | 2018–2020  
- Investigated chemical bonding in clusters and materials  
- Simulated spectra to align with experimental results  
- Expanded HPC infrastructure to support computational projects  

### Research Internships
1. **Center for Nonlinear Studies** | LANL | Summer 2020 
   - Data generation for ML-driven semi-empirical quantum chemistry  

2. **Institute of Physical Organic Chemistry** | Russia | summer 2018, 2019  
   - Designed polyfunctional materials; studied bonding/dynamics in 2D systems  


---

## Education

### PhD in Physical/Computational Chemistry  | Utah State University | 2018–2022  
Advisor: Prof. Alexander I. Boldyrev  
magna cum laude | GPA = 4.0  

### B.Sc in Fundamental & Applied Chemistry  | Southern Federal University | 2012–2017  
magna cum laude | GPA = 4.0  