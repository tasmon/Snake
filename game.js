(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const sbLeft = document.getElementById('sbLeft');
  const sbRight = document.getElementById('sbRight');
  const lskEl = document.getElementById('lsk');
  const rskEl = document.getElementById('rsk');
  const phone = document.getElementById('phone');

  const COLS = 20, ROWS = 22, CELL = 11;

  // ---------- THEMES ----------
  const THEMES = [
    { key:'nokia', name:'Nokia LCD', bg:'#c7e0c0', screenBg:'#c7e0c0', grid:'#b6d4ae', snake:'#14330a', head:'#0a1f05', apple:'#7a1e1e', text:'#0a1f05', obstacle:'#5c7a54' },
    { key:'amber', name:'Amber Retro', bg:'#1a1005', screenBg:'#1a1005', grid:'#241605', snake:'#ffb000', head:'#fff2c2', apple:'#ff5a00', text:'#ffb000', obstacle:'#6b4c12' },
    { key:'neon', name:'Neon Cyber', bg:'#05010f', screenBg:'#05010f', grid:'#12071f', snake:'#39ff14', head:'#c8ffb8', apple:'#ff00ff', text:'#39ff14', obstacle:'#3a1a5c' },
    { key:'midnight', name:'Midnight Blue', bg:'#001028', screenBg:'#001028', grid:'#062038', snake:'#00e5ff', head:'#c2f9ff', apple:'#ffa500', text:'#00e5ff', obstacle:'#0d3f66' },
  ];

  // ---------- MODES ----------
  const MODES = [
    { key:'classic', name:'Classic', wrap:false, maze:false, timed:false, base:220, step:8, min:90 },
    { key:'wrap', name:'No Walls', wrap:true, maze:false, timed:false, base:220, step:8, min:90 },
    { key:'maze', name:'Maze', wrap:false, maze:true, timed:false, base:200, step:7, min:95 },
    { key:'speed', name:'Speed Rush', wrap:false, maze:false, timed:false, base:150, step:12, min:65 },
    { key:'timed', name:'Timed Attack', wrap:true, maze:false, timed:true, limit:60000, base:180, step:5, min:100 },
  ];

  let themeIdx = 0;
  let modeIdx = 0;

  function theme(){ return THEMES[themeIdx]; }
  function mode(){ return MODES[modeIdx]; }

  // ---------- STATE ----------
  let state = 'MENU_MAIN';
  let menuSel = 0;
  const mainMenuItems = ['Start Game','Select Mode','Select Theme','High Scores'];

  // ---------- GAME VARS ----------
  let snake, dir, nextDir, apple, obstacles, score, level, stepMs, lastStep, gameOverReason;
  let boostReadyAt = 0, boostUntil = 0, boostFlashUntil = 0;
  let timeLeft = 0, timedStart = 0;
  let rafId = null;

  function hsKey(m){ return 'snake_hs_' + m; }
  function getHighScore(m){ return parseInt(localStorage.getItem(hsKey(m))||'0',10); }
  function setHighScore(m, v){
    if (v > getHighScore(m)) localStorage.setItem(hsKey(m), String(v));
  }

  function genObstacles(){
    const s = new Set();
    if (!mode().maze) return s;
    const addRow = (row, skipStart, skipEnd) => {
      for (let x=1;x<COLS-1;x++){
        if (x>=skipStart && x<=skipEnd) continue;
        s.add(x+','+row);
      }
    };
    addRow(7, 9, 11);
    addRow(15, 8, 10);
    return s;
  }

  function resetGame(){
    const midY = Math.floor(ROWS/2);
    snake = [ {x:5,y:midY}, {x:4,y:midY}, {x:3,y:midY} ];
    dir = {x:1,y:0};
    nextDir = {x:1,y:0};
    obstacles = genObstacles();
    score = 0;
    level = 1;
    stepMs = mode().base;
    lastStep = 0;
    boostReadyAt = 0; boostUntil = 0; boostFlashUntil = 0;
    timeLeft = mode().timed ? mode().limit : 0;
    timedStart = performance.now();
    spawnApple();
  }

  function spawnApple(){
    let x,y,ok;
    do {
      x = Math.floor(Math.random()*COLS);
      y = Math.floor(Math.random()*ROWS);
      ok = !snake.some(s=>s.x===x&&s.y===y) && !obstacles.has(x+','+y);
    } while(!ok);
    apple = {x,y};
  }

  // ---------- INPUT ----------
  const KEY_UP = ['ArrowUp','Digit2','2'];
  const KEY_DOWN = ['ArrowDown','Digit8','8'];
  const KEY_LEFT = ['ArrowLeft','Digit4','4'];
  const KEY_RIGHT = ['ArrowRight','Digit6','6'];
  const KEY_PAUSE = ['Digit0','0'];
  const KEY_BOOST = ['Digit5','5'];
  const KEY_SELECT = ['Enter'];
  const KEY_BACK = ['Escape','Backspace'];

  function handleKey(code, key){
    const has = (arr)=> arr.includes(code) || arr.includes(key);

    if (state === 'PLAYING'){
      if (has(KEY_UP) && dir.y===0) nextDir={x:0,y:-1};
      else if (has(KEY_DOWN) && dir.y===0) nextDir={x:0,y:1};
      else if (has(KEY_LEFT) && dir.x===0) nextDir={x:-1,y:0};
      else if (has(KEY_RIGHT) && dir.x===0) nextDir={x:1,y:0};
      else if (has(KEY_PAUSE)) doPause();
      else if (has(KEY_BOOST)) doBoost();
      else if (has(KEY_BACK)) { state='MENU_MAIN'; menuSel=0; render(); }
      return;
    }
    if (state === 'PAUSED'){
      if (has(KEY_PAUSE)) doResume();
      else if (has(KEY_BACK)) { state='MENU_MAIN'; menuSel=0; render(); }
      return;
    }
    if (state === 'GAMEOVER'){
      if (has(KEY_SELECT)) { resetGame(); state='PLAYING'; render(); }
      else if (has(KEY_BACK)) { state='MENU_MAIN'; menuSel=0; render(); }
      return;
    }
    if (state === 'MENU_MAIN'){
      if (has(KEY_UP)) { menuSel=(menuSel-1+mainMenuItems.length)%mainMenuItems.length; render(); }
      else if (has(KEY_DOWN)) { menuSel=(menuSel+1)%mainMenuItems.length; render(); }
      else if (has(KEY_SELECT)) selectMain();
      else if (has(KEY_BACK)) exitApp();
      return;
    }
    if (state === 'MENU_MODE'){
      if (has(KEY_UP)) { menuSel=(menuSel-1+MODES.length)%MODES.length; render(); }
      else if (has(KEY_DOWN)) { menuSel=(menuSel+1)%MODES.length; render(); }
      else if (has(KEY_SELECT)) { modeIdx=menuSel; state='MENU_MAIN'; menuSel=0; render(); }
      else if (has(KEY_BACK)) { state='MENU_MAIN'; menuSel=0; render(); }
      return;
    }
    if (state === 'MENU_THEME'){
      if (has(KEY_UP)) { menuSel=(menuSel-1+THEMES.length)%THEMES.length; render(); }
      else if (has(KEY_DOWN)) { menuSel=(menuSel+1)%THEMES.length; render(); }
      else if (has(KEY_SELECT)) { themeIdx=menuSel; state='MENU_MAIN'; menuSel=0; render(); }
      else if (has(KEY_BACK)) { state='MENU_MAIN'; menuSel=0; render(); }
      return;
    }
    if (state === 'MENU_HS'){
      if (has(KEY_BACK) || has(KEY_SELECT)) { state='MENU_MAIN'; menuSel=0; render(); }
      return;
    }
    if (state === 'EXITED'){
      state='MENU_MAIN'; menuSel=0; render();
      return;
    }
  }

  function selectMain(){
    if (menuSel===0){ resetGame(); state='PLAYING'; }
    else if (menuSel===1){ state='MENU_MODE'; menuSel=modeIdx; }
    else if (menuSel===2){ state='MENU_THEME'; menuSel=themeIdx; }
    else if (menuSel===3){ state='MENU_HS'; menuSel=0; }
    render();
  }

  function exitApp(){
    state='EXITED';
    if (rafId) cancelAnimationFrame(rafId);
    render();
  }

  function doPause(){ state='PAUSED'; render(); }
  function doResume(){ state='PLAYING'; lastStep=performance.now(); render(); }

  function doBoost(){
    if (state!=='PLAYING') return;
    const now = performance.now();
    if (now < boostReadyAt) return;
    boostUntil = now + 1500;
    boostFlashUntil = now + 1500;
    boostReadyAt = now + 4500;
  }

  document.addEventListener('keydown', (e)=>{
    handleKey(e.code, e.key);
    if (e.key.startsWith('Arrow')) e.preventDefault();
  });

  lskEl.addEventListener('click', ()=>{
    if (state==='MENU_MAIN') selectMain();
    else if (state==='MENU_MODE') { modeIdx=menuSel; state='MENU_MAIN'; menuSel=0; render(); }
    else if (state==='MENU_THEME') { themeIdx=menuSel; state='MENU_MAIN'; menuSel=0; render(); }
    else if (state==='MENU_HS') { state='MENU_MAIN'; menuSel=0; render(); }
    else if (state==='PLAYING') { state='MENU_MAIN'; menuSel=0; render(); }
    else if (state==='PAUSED') doResume();
    else if (state==='GAMEOVER') { resetGame(); state='PLAYING'; render(); }
    else if (state==='EXITED') { state='MENU_MAIN'; menuSel=0; render(); }
  });
  rskEl.addEventListener('click', ()=>{
    if (state==='MENU_MAIN') exitApp();
    else if (['MENU_MODE','MENU_THEME','MENU_HS'].includes(state)) { state='MENU_MAIN'; menuSel=0; render(); }
    else if (state==='PLAYING' || state==='PAUSED') { state='MENU_MAIN'; menuSel=0; render(); }
    else if (state==='GAMEOVER') { state='MENU_MAIN'; menuSel=0; render(); }
    else if (state==='EXITED') { state='MENU_MAIN'; menuSel=0; render(); }
  });

  // ---------- GAME LOOP ----------
  function loop(ts){
    rafId = requestAnimationFrame(loop);
    if (state !== 'PLAYING') { return; }

    if (mode().timed){
      timeLeft = Math.max(0, mode().limit - (ts - timedStart));
      if (timeLeft <= 0){
        endGame('TIME UP!');
        return;
      }
    }

    if (!lastStep) lastStep = ts;
    const boosting = ts < boostUntil;
    const curStep = boosting ? stepMs * 0.45 : stepMs;

    if (ts - lastStep >= curStep){
      lastStep = ts;
      step();
    }
    render();
  }

  function step(){
    dir = nextDir;
    let nx = snake[0].x + dir.x;
    let ny = snake[0].y + dir.y;

    if (mode().wrap){
      nx = (nx + COLS) % COLS;
      ny = (ny + ROWS) % ROWS;
    } else {
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS){
        endGame('WALL HIT!');
        return;
      }
    }
    if (obstacles.has(nx+','+ny)){
      endGame('CRASHED!');
      return;
    }
    for (let i=0;i<snake.length;i++){
      if (snake[i].x===nx && snake[i].y===ny){
        endGame('SELF BITE!');
        return;
      }
    }

    snake.unshift({x:nx,y:ny});
    if (nx===apple.x && ny===apple.y){
      score += 10;
      if (score % 50 === 0){
        level++;
        stepMs = Math.max(mode().min, stepMs - mode().step);
      }
      spawnApple();
    } else {
      snake.pop();
    }
  }

  function endGame(reason){
    gameOverReason = reason;
    setHighScore(mode().key, score);
    state = 'GAMEOVER';
  }

  // ---------- RENDER ----------
  function applyThemeCss(){
    const t = theme();
    phone.style.background = t.bg;
    document.getElementById('statusbar').style.background = t.bg;
    document.getElementById('softkeys').style.background = t.bg;
    document.getElementById('statusbar').style.color = t.text;
    document.getElementById('softkeys').style.color = t.text;
    document.getElementById('screenWrap').style.background = t.screenBg;
    overlay.style.color = t.text;
    overlay.style.background = t.screenBg;
  }

  function setSoftkeys(l, r){ lskEl.textContent = l; rskEl.textContent = r; }

  function render(){
    applyThemeCss();

    if (state === 'PLAYING' || state === 'PAUSED' || state === 'GAMEOVER'){
      overlay.classList.add('hidden');
      canvas.style.display = 'block';
      drawGame();
    } else {
      canvas.style.display = 'none';
      overlay.classList.remove('hidden');
    }

    if (state === 'PLAYING'){
      sbLeft.textContent = mode().name;
      sbRight.textContent = mode().timed
        ? ('T:'+Math.ceil(timeLeft/1000)+'s '+score)
        : ('Lv'+level+' '+score);
      setSoftkeys('Menu','Exit');
    } else if (state === 'PAUSED'){
      sbLeft.textContent = mode().name;
      sbRight.textContent = 'PAUSED';
      setSoftkeys('Resume','Menu');
    } else if (state === 'GAMEOVER'){
      sbLeft.textContent = mode().name;
      sbRight.textContent = 'GAME OVER';
      setSoftkeys('Retry','Menu');
    } else if (state === 'MENU_MAIN'){
      sbLeft.textContent = 'SNAKE';
      sbRight.textContent = '';
      setSoftkeys('Select','Exit');
      overlay.innerHTML =
        '<div class="title">SNAKE</div>' +
        '<div class="menuList">' +
        mainMenuItems.map((it,i)=>
          '<div class="menuItem'+(i===menuSel?' sel':'')+'">'+(i===menuSel?'> ':'  ')+it+'</div>'
        ).join('') +
        '</div>' +
        '<div class="hint">Mode: '+mode().name+' | Theme: '+theme().name+'<br>2/8/4/6 move  0 pause  5 boost</div>';
    } else if (state === 'MENU_MODE'){
      sbLeft.textContent = 'SELECT MODE';
      sbRight.textContent = '';
      setSoftkeys('Select','Back');
      overlay.innerHTML =
        '<div class="title">MODE</div>' +
        '<div class="menuList">' +
        MODES.map((m,i)=>
          '<div class="menuItem'+(i===menuSel?' sel':'')+'">'+(i===menuSel?'> ':'  ')+m.name+(i===modeIdx?' *':'')+'</div>'
        ).join('') +
        '</div>' +
        '<div class="hint">HS: '+getHighScore(MODES[menuSel].key)+'</div>';
    } else if (state === 'MENU_THEME'){
      sbLeft.textContent = 'SELECT THEME';
      sbRight.textContent = '';
      setSoftkeys('Select','Back');
      overlay.innerHTML =
        '<div class="title">THEME</div>' +
        '<div class="menuList">' +
        THEMES.map((th,i)=>
          '<div class="menuItem'+(i===menuSel?' sel':'')+'">'+(i===menuSel?'> ':'  ')+th.name+(i===themeIdx?' *':'')+'</div>'
        ).join('') +
        '</div>';
    } else if (state === 'MENU_HS'){
      sbLeft.textContent = 'HIGH SCORES';
      sbRight.textContent = '';
      setSoftkeys('Back','Back');
      overlay.innerHTML =
        '<div class="title">HIGH SCORES</div>' +
        '<div class="menuList">' +
        MODES.map(m=>'<div class="menuItem">'+m.name+': '+getHighScore(m.key)+'</div>').join('') +
        '</div>';
    } else if (state === 'EXITED'){
      sbLeft.textContent = 'SNAKE';
      sbRight.textContent = '';
      setSoftkeys('Reopen','-');
      overlay.innerHTML = '<div class="title">GOODBYE</div><div class="hint">App closed.<br>Press any key to reopen.</div>';
    }
  }

  function drawGame(){
    const t = theme();
    ctx.fillStyle = t.screenBg;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.strokeStyle = t.grid;
    ctx.lineWidth = 1;
    for (let x=0;x<=COLS;x++){
      ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,ROWS*CELL); ctx.stroke();
    }
    for (let y=0;y<=ROWS;y++){
      ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(COLS*CELL,y*CELL); ctx.stroke();
    }

    ctx.fillStyle = t.obstacle;
    obstacles.forEach(key=>{
      const [x,y] = key.split(',').map(Number);
      ctx.fillRect(x*CELL+1,y*CELL+1,CELL-2,CELL-2);
    });

    ctx.fillStyle = t.apple;
    ctx.beginPath();
    ctx.arc(apple.x*CELL+CELL/2, apple.y*CELL+CELL/2, CELL/2-1, 0, Math.PI*2);
    ctx.fill();

    snake.forEach((s,i)=>{
      ctx.fillStyle = i===0 ? t.head : t.snake;
      ctx.fillRect(s.x*CELL+1, s.y*CELL+1, CELL-2, CELL-2);
    });

    if (performance.now() < boostFlashUntil){
      ctx.strokeStyle = t.head;
      ctx.lineWidth = 2;
      ctx.strokeRect(1,1,canvas.width-2,canvas.height-2);
    }

    if (state === 'PAUSED'){
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width/2, canvas.height/2);
      ctx.font = '9px monospace';
      ctx.fillText('Press 0 to resume', canvas.width/2, canvas.height/2+16);
    }
    if (state === 'GAMEOVER'){
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2-26);
      ctx.font = '9px monospace';
      ctx.fillText(gameOverReason||'', canvas.width/2, canvas.height/2-10);
      ctx.fillText('Score: '+score, canvas.width/2, canvas.height/2+6);
      ctx.fillText('Best: '+getHighScore(mode().key), canvas.width/2, canvas.height/2+20);
      ctx.fillText('LSK Retry  RSK Menu', canvas.width/2, canvas.height/2+38);
    }
  }

  resetGame();
  applyThemeCss();
  render();
  rafId = requestAnimationFrame(loop);
})();
