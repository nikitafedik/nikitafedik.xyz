---
title: "📢 New work on transition path sampling and ML"
author: fns
date: 2025-06-14
categories: [news]
tags: [ml, publication]
comments: true
image: /assets/my_stuff/posts/2025/ml-tps-cover-plain.jpg
---

After months of hard work, and organizing [MLCM-25](https://mlcm-25.github.io), which is why I'm posting about this month later after release, we've answered (or at least raised!) some critical questions in ML-driven chemistry that I believe every computational scientist should consider:    
📄 [Full Open Access article](https://pubs.rsc.org/en/content/articlehtml/2025/dd/d4dd00265b)     
💻 [Scripts | Models | Github](https://github.com/nikitafedik/ml_tps_si)

### 🔬 Benchmarking ML interatomic potentials
Random data splits or even snapshots from an MD trajectory may not actually reflect a model's true accuracy. We tested two neural networks on identical training data with nearly identical RMSE scores, yet one discovered an entire conformational basin the other completely missed.

### 🧠 The irreplaceable role of domain expertise
Despite AI advances, chemistry and materials knowledge remains absolutely essential for meaningful ML research and selecting test cases. Our azobenzene studies showed that closed-shell DFT training data simply cannot capture bond-breaking mechanisms, forcing models to predict thermodynamically unfavorable higher-energy pathways instead. You need a domain expert to design meaningful test cases across the vast landscape of chemical properties and reaction intricacies. This is something I would be extremely wary of outsourcing to even the most capable AI agents.

### ⚗️ Model variability revelation
Same training data, different (but similarly accurate) ML models = drastically different molecular trajectories. Despite a pronounced correlation in energy and atomic forces predictions, our models generated completely different transition pathways. This has major implications for reproducibility and for ML-driven dynamics in general. 

And as a bonus, we were featured on the cover—such a great way to wrap up this project. 

![image](/assets/my_stuff/posts/2025/ml-tps-cover.jpg){: width="100%" .w-75 .normal}       

Title: “Challenges and opportunities for machine learning potentials in transition path sampling: alanine dipeptide and azobenzene studies”   
Cover author: Nikita Fedik. Full cover composed by RSC.    
Source: [Digital Discovery, 159](https://pubs.rsc.org/en/content/articlehtml/2025/dd/d4dd00265b)    
License: CC BY-NC    
{: .text-left .credit style="font-size: 70%"}