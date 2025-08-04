---
# the default layout is 'page'
title: Projects
icon: fa-solid fa-gear
order: 2
---
<style>
.projects-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 25px;
    padding: 10px;
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
}

.projects-grid .project-item {
    transition: all 0.3s ease, filter 0.3s ease;
}

.project-item:hover ~ .project-item,
.project-item:has(~ .project-item:hover) {
    filter: blur(6px);
}

.project-item:hover {
    filter: blur(0px);
    z-index: 10;
    position: relative;
    transform: scale(1.5);
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.2);
}

.project-item {
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    transition: all 0.3s ease;
    height: 380px;
    background-color: #fff;
    min-width: 220px;
    padding: 0;
    box-sizing: border-box;
}

/* Pastel colors for groups */
.projects-grid .group1 {
    background-color: light-dark(#e8f4ff, #3f4e61);  /* Darker, brighter blue / Muted dark blue */
}

.projects-grid .group1:hover {
    background-color: light-dark(#d6edff, #3a4651);
}

.projects-grid .group2 {
    background-color: light-dark(#fde8f3, #5b414eff);  /* Darker, brighter pink / Muted dark pink */
}

.projects-grid .group2:hover {
    background-color: light-dark(#fbd4e8, #513a45);
}

.projects-grid .group3 {
    background-color: light-dark(#e8f8e8, #3e423fff);  /* Darker, brighter green / Muted dark green */
}

.projects-grid .group3:hover {
    background-color: light-dark(#d4f0d4, #3a513f);
}

/* First grid row - Image area */
.project-item .project-image-container {
    flex: 0 0 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border-radius: 12px 12px 0 0; /* Only round top corners */
    box-sizing: border-box;
    position: relative;
    width: 100%;
    overflow: hidden;
}

.project-item .project-image {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 10px;
    display: block;
    margin: 0;
    padding: 0;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.25);
    overflow: hidden;
}

/* Second grid row - Description area */
.project-item .project-description {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* Prevent text overflow too */
    padding: 12px 16px;
    margin: 0;
    font-size: min(12px, 1.4vw);
    line-height: 1.4;
    text-align: left;
    box-sizing: border-box;
}

.project-description .description-text {
    flex: 1;
    margin-bottom: 8px;
}

.project-description .description-links {
    margin-top: auto;
    text-align: center;
    padding-top: 12px;
}

/* Responsive adjustments */
@media screen and (max-width: 768px) {
    .projects-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .project-item {
        height: 450px; /* Taller for more vertical space */
    }
    
    .project-item:hover {
        transform: none;
        filter: blur(0px);
        z-index: 10;
        position: relative;
        box-shadow: 0 0 15px rgba(0, 0, 0, 0.15);
    }
    
    .project-item .project-image-container {
        padding: 12px 6px 6px 6px;
    }
    
    .project-item .project-image {
        object-fit: cover;
    }
    
    .project-item .project-description {
        font-size: min(18px, 2.8vw); /* Larger font */
        padding: 10px 12px;
    }
}

@media screen and (max-width: 480px) {
    .projects-grid {
        grid-template-columns: repeat(1, 1fr);
    }
    
    .project-item {
        height: 400px; /* Taller for more vertical space */
    }
    
    .project-item:hover {
        transform: none;
        filter: blur(0px);
        z-index: 10;
        position: relative;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
    
    .project-item .project-image-container {
        padding: 15px 4px 4px 4px;
    }
    
    .project-item .project-image {
        object-fit: cover;
    }
    
    .project-item .project-description {
        font-size: min(16px, 3.5vw); /* Larger font */
        padding: 8px 10px;
    }
}

</style>

# RESEARCH
<div class="projects-grid">
    <div class="project-item group1">
        <div class="project-image-container">
            <img src="/assets/my_stuff/posts/2025/ml-tps-cover-plain.jpg" alt="Project 1" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong>ML in Transition Path Sampling</strong>: different ML potentials trained to the same data produce different transition paths. Domain expertise remains crucial for designing test cases, especially, when chemical bonds change.
            </div>
            <div class="description-links">
                <a href="https://pubs.rsc.org/en/content/articlelanding/2025/dd/d4dd00265b" target="_blank">paper</a> | 
                <a href="https://github.com/nikitafedik/ml_tps_si" target="_blank">github</a> |
                <a href="https://zenodo.org/records/15047941" target="_blank">data</a>
            </div>
        </div>
    </div>
    <div class="project-item group1">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/natchem.png" alt="Project 1" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong> ML beyond atomic energies and forces</strong>: Big review in Nature Chemistry Reviews covering many aspects of molecular ML -  non-local phenomena, excitations, electron densities, enabled by various architectures.
            </div>
            <div class="description-links">
                <a href="https://www.nature.com/articles/s41570-022-00416-3" target="_blank">paper</a> 
            </div>
        </div>
    </div>
    <div class="project-item group1">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/seq2.png" alt="Project 1" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong> ML + Semiempirics</strong>: Invited Perspective on the synergy of ML and semiempirical quantum chemistry. ML-based reparametrization preserves physics core while improving accuracy and transferability.
            </div>
            <div class="description-links">
                <a href="https://pubs.aip.org/aip/jcp/article/159/11/110901/2911476" target="_blank">paper</a> 
            </div>
        </div>
    </div>
    <div class="project-item group1">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/etpa_final.png" alt="Project 1" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong> Entangled Two-Photon Absorption:</strong>: Comprehensive comparison of 1- vs 2-photon processes in experimentally accessible conditions give guidance on further exploration and non-linear crystal selection.
            </div>
            <div class="description-links">
                <a href="https://chemrxiv.org/engage/chemrxiv/article-details/687802fdfc5f0acb528b1bef" target="_blank">preprint</a> 
            </div>
        </div>
    </div>
    <div class="project-item group1">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/c18.png" alt="Project 1" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong>Interlocked Carbon Rings:</strong> Interlocked C<sub>18</sub> rings, catenanes, can rotate freely like molecular machines and have strong mechanical bonds. Like links in a chain, they can build stable long molecular threads.
            </div>
            <div class="description-links">
                <a href="https://pubs.rsc.org/en/content/articlelanding/2020/cc/c9cc09483k/unauth" target="_blank">paper</a>
            </div>     </div>
    </div>


</div>

---

# CODES

<div class="projects-grid">
    <div class="project-item group2">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/pyseqm.png" alt="Project 1" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong>PYSEQM2.0:</strong> fast GPU-enabled package for static and dynamic semiempirical calculations in chemistry. Large-scale excited state simulations and batched Davidson algorithm: excitation energies for 1000-atoms system within minutes on a single GPU.
            </div>
            <div class="description-links">
            <a href="https://github.com/lanl/PYSEQM" target="_blank">github</a>
            </div>
        </div>
    </div>
    <div class="project-item group2">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/alf.png" alt="Project 1" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong>Active Learning Framework [ALF]</strong>: scalable and modular framework for generating data for MLIPs.  Built on top of Parsl, it is designed to run autonomously on HPC systems. Equipped with several interfaces to QM packages ans atomistic NNs, it is ready to deploy for molecules and materials.
            </div>
            <div class="description-links">
                paper (soon) | <a href="https://github.com/lanl/ALF" target="_blank">github</a>
            </div>
        </div>
    </div>
</div>

---

# EVENTS

<div class="projects-grid">
    <div class="project-item group3">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/tsrc25.png" alt="TSRC Conference" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong>TSRC Nano-25</strong>: intimate workshop focusing on advances in nanotechnology and materials science. Emphasis unique interdisciplinary collaborations and networking opporunities across experimentalists, hardcore theoreticians, computational and ML researchers.
            </div>
            <div class="description-links">
                <a href="https://meetings.telluridescience.org/meetings/workshop-details?wid=1212" target="_blank">event page</a> 
            </div>
        </div>
    </div>
    <div class="project-item group3">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/mlcm25.png" alt="MLCM Conference" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong>MLCM-25</strong>: in-person conference bringing together experts and early career researchers at the intersection of ML and materials science. Immersive experience featuring networking events, live feed generated from talks and awards by tech sponsors. 100 participants, 45+ talks.
            </div>
            <div class="description-links">
                <a href="https://mlcm-25.github.io" target="_blank">event website</a> 
            </div>
        </div>
    </div>
    <div class="project-item group3">
        <div class="project-image-container">
            <img src="/assets/my_stuff/projects/mlcm24.png" alt="MLCM Conference" class="project-image">
        </div>
        <div class="project-description">
            <div class="description-text">
                <strong>MLCM-24:</strong>: free online conference  bringing together researchers at the intersection of ML and materials science. First implementation of live feed to collect featured links, codes and papers from talks and discussions. 450+ participants, 50+ talks.
            </div>
            <div class="description-links">
                <a href="https://mlcm2024.lanl.gov" target="_blank">website</a> 
                <a href="https://mlcm2025.org" target="_blank">2025</a>
            </div>
        </div>
    </div>
</div>


