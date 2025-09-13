const fs = require('fs');
const path = require('path');
const config = require('../config');
const serverConfig = require('../config/server');
const userPreferencesManager = require('../userPreferencesManager');

class LinktreeService {
  constructor() {
    this.config = serverConfig.LINKTREE;
  }

  generateLinksGridHTML(links) {
    if (links.length === 0) return '';
    
    const linkSize = this.config.LINK_SIZE;
    const gap = this.config.GAP;
    
    const createLinkHTML = (link) => `
      <a href="${link.url}" target="_blank" class="link-sphere" style="
        width: ${linkSize};
        height: ${linkSize};
        border-radius: 50%;
        background: linear-gradient(135deg, ${this.config.COLORS.SPHERE_GRADIENT_1}, ${this.config.COLORS.SPHERE_GRADIENT_2});
        backdrop-filter: blur(10px);
        border: 1px solid ${this.config.COLORS.BORDER_COLOR};
        display: flex !important;
        flex-direction: column !important;
        align-items: center;
        justify-content: center;
        color: ${this.config.COLORS.TEXT_PRIMARY};
        text-decoration: none;
        transition: all 0.3s ease;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3);
        position: relative;
        overflow: hidden;
        text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
        padding: 10px;
      " 
      onmouseover="this.style.transform='translateY(${this.config.ANIMATIONS.HOVER_TRANSLATE_Y}) scale(${this.config.ANIMATIONS.HOVER_SCALE})'; this.style.boxShadow='0 25px 50px rgba(0,0,0,0.6), 0 12px 24px rgba(0,0,0,0.5)'; this.style.background='linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.2))';"
      onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)'; this.style.background='linear-gradient(135deg, ${this.config.COLORS.SPHERE_GRADIENT_1}, ${this.config.COLORS.SPHERE_GRADIENT_2})';"
      title="${link.title}">
        <div class="icon" style="
          font-size: ${this.config.FONT_SIZES.LINK_ICON};
          margin-bottom: 8px;
        ">
          <i class="${link.icon}"></i>
        </div>
        <div class="title" style="
          font-size: ${this.config.FONT_SIZES.LINK_TITLE};
          font-weight: 600;
          line-height: 1.2;
          text-align: center;
          word-wrap: break-word;
          max-width: 100%;
        ">${link.title}</div>
      </a>
    `;
    
    return this.buildGridLayout(links, createLinkHTML, linkSize, gap);
  }

  buildGridLayout(links, createLinkHTML, linkSize, gap) {
    let gridHTML = '';
    
    if (links.length <= this.config.MAX_LINKS_PER_ROW) {
      gridHTML = `
        <div style="
          display: grid;
          grid-template-columns: repeat(${links.length}, 1fr);
          gap: ${gap};
          justify-items: center;
          margin-bottom: 30px;
          max-width: ${parseInt(linkSize) * this.config.MAX_LINKS_PER_ROW + parseInt(gap) * 3}px;
          margin-left: auto;
          margin-right: auto;
        ">
          ${links.map(createLinkHTML).join('')}
        </div>
      `;
    } else if (links.length <= 8) {
      const firstRow = links.slice(0, this.config.MAX_LINKS_PER_ROW);
      const secondRow = links.slice(this.config.MAX_LINKS_PER_ROW, 8);
      
      gridHTML = `
        <div style="margin-bottom: 30px;">
          <div style="
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: ${gap};
            justify-items: center;
            margin-bottom: ${gap};
            max-width: ${parseInt(linkSize) * this.config.MAX_LINKS_PER_ROW + parseInt(gap) * 3}px;
            margin-left: auto;
            margin-right: auto;
          ">
            ${firstRow.map(createLinkHTML).join('')}
          </div>
          <div style="
            display: grid;
            grid-template-columns: repeat(${secondRow.length}, 1fr);
            gap: ${gap};
            justify-items: center;
            max-width: ${parseInt(linkSize) * secondRow.length + parseInt(gap) * (secondRow.length - 1)}px;
            margin-left: auto;
            margin-right: auto;
          ">
            ${secondRow.map(createLinkHTML).join('')}
          </div>
        </div>
      `;
    } else {
      const firstRow = links.slice(0, this.config.MAX_LINKS_PER_ROW);
      const secondRow = links.slice(this.config.MAX_LINKS_PER_ROW, 8);
      const thirdRow = links.slice(8, this.config.MAX_TOTAL_LINKS);
      
      gridHTML = `
        <div style="margin-bottom: 30px;">
          <div style="
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: ${gap};
            justify-items: center;
            margin-bottom: ${gap};
            max-width: ${parseInt(linkSize) * this.config.MAX_LINKS_PER_ROW + parseInt(gap) * 3}px;
            margin-left: auto;
            margin-right: auto;
          ">
            ${firstRow.map(createLinkHTML).join('')}
          </div>
          <div style="
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: ${gap};
            justify-items: center;
            margin-bottom: ${gap};
            max-width: ${parseInt(linkSize) * this.config.MAX_LINKS_PER_ROW + parseInt(gap) * 3}px;
            margin-left: auto;
            margin-right: auto;
          ">
            ${secondRow.map(createLinkHTML).join('')}
          </div>
          <div style="
            display: grid;
            grid-template-columns: repeat(${thirdRow.length}, 1fr);
            gap: ${gap};
            justify-items: center;
            max-width: ${parseInt(linkSize) * thirdRow.length + parseInt(gap) * (thirdRow.length - 1)}px;
            margin-left: auto;
            margin-right: auto;
          ">
            ${thirdRow.map(createLinkHTML).join('')}
          </div>
        </div>
      `;
    }
    
    return gridHTML;
  }

  generateBackgroundSpheres() {
    const spheres = [];
    for (let i = 0; i < this.config.SPHERES.COUNT; i++) {
      const size = this.config.SPHERES.SIZES[i];
      const position = this.config.SPHERES.POSITIONS[i];
      const duration = this.config.SPHERES.ANIMATION_DURATIONS[i];
      
      const positionStyle = Object.entries(position)
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');
      
      spheres.push(`
        <div class="sphere sphere-${i + 1}" style="
          position: absolute;
          width: ${size}px;
          height: ${size}px;
          border-radius: 50%;
          background: linear-gradient(45deg, rgba(255,255,255,${0.1 - i * 0.01}), rgba(255,255,255,${0.05 - i * 0.005}));
          ${positionStyle};
          animation: float ${duration} ease-in-out infinite${i % 2 === 1 ? ' reverse' : ''};
        "></div>
      `);
    }
    return spheres.join('');
  }

  generateLinktreeHTML(linktree, fullName, jobTitlesArray) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${fullName} - Linktree</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
          ${this.generateCSS()}
        </style>
      </head>
      <body>
        <div class="linktree-page-container" style="
          background: linear-gradient(135deg, ${this.config.COLORS.GRADIENT_START} 0%, ${this.config.COLORS.GRADIENT_END} 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 20px;
          flex: 1;
          padding-bottom: 100px;
        ">
          ${this.generateBackgroundSpheres()}
          
          <div class="linktree-content" style="
            text-align: center;
            z-index: 2;
            max-width: 500px;
            width: 100%;
          ">
            ${fullName ? `
              <h1 style="
                color: ${this.config.COLORS.TEXT_PRIMARY};
                font-size: ${this.config.FONT_SIZES.MAIN_TITLE};
                margin-bottom: 10px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4);
                font-weight: 600;
              ">${fullName}</h1>
            ` : ''}
            
            ${linktree.header ? `
              <p style="
                color: ${this.config.COLORS.TEXT_SECONDARY};
                font-size: ${this.config.FONT_SIZES.HEADER};
                margin-bottom: 10px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
              ">${linktree.header}</p>
            ` : ''}
            
            ${jobTitlesArray.length > 0 ? `
              <p style="
                color: ${this.config.COLORS.TEXT_TERTIARY};
                font-size: ${this.config.FONT_SIZES.JOB_TITLES};
                margin-bottom: ${linktree.email ? '10px' : '30px'};
                text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
              ">${jobTitlesArray.join(' | ')}</p>
            ` : ''}
            
            ${linktree.email ? `
              <p style="
                color: ${this.config.COLORS.TEXT_TERTIARY};
                font-size: ${this.config.FONT_SIZES.EMAIL};
                margin-bottom: 30px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
              ">
                <a href="mailto:${linktree.email}" style="
                  color: ${this.config.COLORS.TEXT_TERTIARY};
                  text-decoration: none;
                  transition: color 0.3s ease;
                  text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                " onmouseover="this.style.color='${this.config.COLORS.TEXT_PRIMARY}'" onmouseout="this.style.color='${this.config.COLORS.TEXT_TERTIARY}'">${linktree.email}</a>
              </p>
            ` : ''}
            
            ${this.generateLinksGridHTML(linktree.links)}
          </div>
        </div>
        
        <div style="
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 15px 20px;
          text-align: center;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8));
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.7);
          font-size: 0.9rem;
          z-index: 10;
        ">
          <a href="http://localhost:${config.PORT}/" class="footer-link" target="_blank">
            <p>Powered by <strong>myJobBuddy</strong></p>
            <p style="margin-top: 3px; font-size: 0.8rem;">Professional networking made simple</p>
          </a>
        </div>
      </body>
      </html>
    `;
  }

  generateCSS() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Arial', sans-serif;
        overflow-x: hidden;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      
      @keyframes float {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-30px) rotate(180deg); }
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 0.7; }
        50% { transform: scale(1.1); opacity: 0.9; }
      }
      
      .sphere {
        cursor: pointer;
        transition: all 0.3s ease;
      }
      
      .sphere:hover {
        animation: pulse ${this.config.ANIMATIONS.PULSE_DURATION} ease-in-out infinite !important;
        transform: scale(1.2) !important;
      }
      
      .link-sphere::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 50%;
        background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .link-sphere:hover::before {
        opacity: 1;
      }
      
      .footer-link {
        color: inherit;
        text-decoration: none;
        transition: color 0.3s ease;
      }
      
      .footer-link:hover {
        color: rgba(255,255,255,0.9);
      }
      
      @media (max-width: 768px) {
        .linktree-content {
          padding: 0 15px;
        }
        
        h1 {
          font-size: 2rem !important;
        }
        
        .sphere {
          display: none;
        }
      }
      
      @media (max-width: 480px) {
        h1 {
          font-size: 1.8rem !important;
        }
      }
    `;
  }

  async findLinktreeBySlug(treeId, slug) {
    let foundLinktree = null;
    let foundUser = null;
    
    try {
      const userPrefsDir = path.join(config.paths.rootDir, serverConfig.PATHS.USER_PREFERENCES_DIR);
      const files = fs.readdirSync(userPrefsDir);
      
      for (const file of files) {
        if (file.startsWith('user_') && file.endsWith('.json')) {
          try {
            const filePath = path.join(userPrefsDir, file);
            const userData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (userData.linktrees && userData.linktrees[treeId]) {
              const linktree = userData.linktrees[treeId];
              
              const expectedSlug = `${linktree.firstName || ''}-${linktree.lastName || ''}`
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-')
                .replace(/-+/g, '-');
              
              if (expectedSlug === slug || !slug) {
                foundLinktree = linktree;
                foundUser = userData;
                break;
              }
            }
          } catch (fileError) {
            config.smartLog('fail', `Error reading user file ${file}: ${fileError.message}`);
            continue;
          }
        }
      }
    } catch (dirError) {
      config.smartLog('fail', `Error reading user preferences directory: ${dirError.message}`);
    }
    
    if (!foundLinktree && userPreferencesManager.getAllUsers) {
      try {
        const allUsers = await userPreferencesManager.getAllUsers();
        for (const userData of allUsers) {
          if (userData.linktrees && userData.linktrees[treeId]) {
            const linktree = userData.linktrees[treeId];
            
            const expectedSlug = `${linktree.firstName || ''}-${linktree.lastName || ''}`
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '-')
              .replace(/-+/g, '-');
            
            if (expectedSlug === slug || !slug) {
              foundLinktree = linktree;
              foundUser = userData;
              break;
            }
          }
        }
      } catch (dbError) {
        config.smartLog('fail', `Error searching in database: ${dbError.message}`);
      }
    }
    
    return { linktree: foundLinktree, user: foundUser };
  }

  validateLinktreeData(linktree) {
    return linktree.firstName && 
           linktree.lastName && 
           linktree.links && 
           linktree.links.length > 0;
  }

  async renderLinktree(treeId, slug) {
    try {
      const { linktree, user } = await this.findLinktreeBySlug(treeId, slug);
      
      if (!linktree) {
        return { 
          success: false, 
          statusCode: 404, 
          message: `Linktree ${treeId} not found` 
        };
      }
      
      if (!this.validateLinktreeData(linktree)) {
        return { 
          success: false, 
          statusCode: 404, 
          message: 'Linktree not complete - missing required data (name and links)' 
        };
      }
      
      const fullName = `${linktree.firstName || ''} ${linktree.lastName || ''}`.trim();
      const jobTitlesArray = (linktree.jobTitles || '').split('|').map(t => t.trim()).filter(t => t);
      
      const html = this.generateLinktreeHTML(linktree, fullName, jobTitlesArray);
      
      return { 
        success: true, 
        html,
        linktree,
        user 
      };
      
    } catch (error) {
      config.smartLog('fail', `Error generating linktree: ${error.message}`);
      return { 
        success: false, 
        statusCode: 500, 
        message: `Internal server error: ${error.message}` 
      };
    }
  }
}

module.exports = new LinktreeService();