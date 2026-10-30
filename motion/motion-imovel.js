/* lugus motion-imovel: comportamento dos componentes. Sem dependencia, sem build.
   Inicia sozinho por atributos data-mi-*. Respeita prefers-reduced-motion. */
(function () {
  'use strict'
  var doc = document.documentElement
  doc.classList.add('mi-js')
  var reduz = window.matchMedia('(prefers-reduced-motion: reduce)')
  var temScrollTimeline = window.CSS && CSS.supports && CSS.supports('animation-timeline: view()')
  var EXPO = function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t) }
  function guarda(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v) } catch (e) { return null } }
  function aoVer(el, fn, opts) {
    if (!('IntersectionObserver' in window)) { fn(true); return }
    new IntersectionObserver(function (es, obs) {
      es.forEach(function (e) { fn(e.isIntersecting, obs) })
    }, opts || { threshold: 0.25 }).observe(el)
  }

  /* ---------- hero de video: AV1 -> VP9 -> H.264 escolhido pelo navegador via <source type>,
     nunca por JS (mediaCapabilities erra no Safari com M3/A18, bug WebKit 311593) */
  function hero(el) {
    var v = el.querySelector('video')
    var btn = el.querySelector('.mi-pausa')
    var img = el.querySelector('.mi-hero__midia img')
    if (!v) return
    var pausadoPeloUsuario = guarda('mi-hero-pausa') === '1'
    var visivel = true
    function estado(s) { el.setAttribute('data-estado', s) }
    function rotulo(pausado) {
      if (!btn) return
      btn.setAttribute('aria-label', pausado ? 'Tocar vídeo de fundo' : 'Pausar vídeo de fundo')
      btn.setAttribute('aria-pressed', pausado ? 'true' : 'false')
    }
    function fallback() {
      // economia de bateria do iPhone recusa autoplay: troca por webp animado, baixado so aqui
      var src = el.getAttribute('data-fallback')
      if (!src || pausadoPeloUsuario) { estado('parado'); return }
      estado('fallback')
      img.removeAttribute('srcset'); img.src = src
      var pic = img.closest('picture')
      if (pic) pic.querySelectorAll('source').forEach(function (s) { s.remove() })
    }
    function tocar() {
      var p = v.play()
      if (p && p.catch) p.catch(function (e) { if (e && e.name === 'NotAllowedError') fallback() })
    }
    if (reduz.matches) { v.removeAttribute('autoplay'); v.preload = 'none'; v.pause(); estado('parado'); return }
    v.addEventListener('playing', function () { estado('tocando'); rotulo(false) })
    v.addEventListener('pause', function () { if (el.getAttribute('data-estado') !== 'fallback') estado('pausado') })
    if (pausadoPeloUsuario) { v.removeAttribute('autoplay'); v.pause(); estado('pausado'); rotulo(true) } else { tocar(); rotulo(false) }
    // se o navegador nao recusou nem tocou em 4 s (ex.: Safari sem evento), confere de novo
    setTimeout(function () { if (!pausadoPeloUsuario && v.paused && visivel && el.getAttribute('data-estado') !== 'tocando') tocar() }, 4000)
    if (btn) btn.addEventListener('click', function () {
      pausadoPeloUsuario = !pausadoPeloUsuario
      guarda('mi-hero-pausa', pausadoPeloUsuario ? '1' : '0')
      if (el.getAttribute('data-estado') === 'fallback' && pausadoPeloUsuario) { img.src = el.getAttribute('data-poster') || img.src; estado('pausado'); rotulo(true); return }
      if (pausadoPeloUsuario) { v.pause(); estado('pausado') } else { tocar() }
      rotulo(pausadoPeloUsuario)
    })
    // fora da tela, pausa (bateria) sem mudar a escolha do usuario
    aoVer(el, function (dentro) {
      visivel = dentro
      if (!dentro && !v.paused) v.pause()
      else if (dentro && !pausadoPeloUsuario && v.paused && el.getAttribute('data-estado') !== 'fallback') tocar()
    }, { threshold: 0.05 })
  }

  /* ---------- scroll-scrub em canvas: quadros WebP baixados so perto da secao, em passes
     (de 8 em 8, depois 4, 2, 1) para o movimento existir cedo e ganhar definicao */
  function scrub(el) {
    var canvas = el.querySelector('canvas')
    var ctx = canvas && canvas.getContext('2d')
    var n = parseInt(el.getAttribute('data-quadros'), 10)
    var base = el.getAttribute('data-base')
    var dig = parseInt(el.getAttribute('data-digitos') || '3', 10)
    var passos = el.querySelectorAll('[data-mi-passo]')
    if (!ctx || !n || !base || reduz.matches) return
    var imgs = new Array(n), prontos = new Array(n), iniciou = false, ativo = false, ultimo = -1
    function url(i) { var s = String(i + 1); while (s.length < dig) s = '0' + s; return base + s + '.webp' }
    function carregar() {
      if (iniciou) return
      iniciou = true
      var ordem = [], visto = {}
      ;[8, 4, 2, 1].forEach(function (passo) { for (var i = 0; i < n; i += passo) if (!visto[i]) { visto[i] = 1; ordem.push(i) } })
      if (!visto[n - 1]) ordem.push(n - 1)
      var k = 0, emVoo = 0
      function prox() {
        while (emVoo < 6 && k < ordem.length) {
          (function (i) {
            emVoo++
            var im = new Image()
            im.decoding = 'async'
            im.onload = function () { prontos[i] = true; emVoo--; if (ultimo < 0) desenhar(true); prox() }
            im.onerror = function () { emVoo--; prox() }
            im.src = url(i)
            imgs[i] = im
          })(ordem[k++])
        }
      }
      prox()
    }
    function maisPerto(i) {
      for (var d = 0; d < n; d++) {
        if (i - d >= 0 && prontos[i - d]) return i - d
        if (i + d < n && prontos[i + d]) return i + d
      }
      return -1
    }
    function tamanho() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2)
      var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; ultimo = -1 }
    }
    function progresso() {
      var r = el.getBoundingClientRect()
      var curso = r.height - window.innerHeight
      return curso > 0 ? Math.min(1, Math.max(0, -r.top / curso)) : 0
    }
    function desenhar(forcar) {
      tamanho()
      var p = progresso()
      el.style.setProperty('--mi-p', p.toFixed(4))
      var i = maisPerto(Math.round(p * (n - 1)))
      if (i < 0 || (i === ultimo && !forcar)) return
      ultimo = i
      var im = imgs[i], cw = canvas.width, ch = canvas.height
      var s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight)
      var w = im.naturalWidth * s, h = im.naturalHeight * s
      ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h)
      for (var k = 0; k < passos.length; k++) {
        var de = parseFloat(passos[k].getAttribute('data-de')), ate = parseFloat(passos[k].getAttribute('data-ate'))
        passos[k].classList.toggle('mi-ativo', p >= de && p < ate)
      }
    }
    function laco() { if (!ativo) return; desenhar(false); requestAnimationFrame(laco) }
    aoVer(el, function (dentro) {
      if (dentro) carregar()
      ativo = dentro
      if (dentro) requestAnimationFrame(laco)
    }, { rootMargin: '600px 0px', threshold: 0 })
    window.addEventListener('resize', function () { ultimo = -1 })
  }

  /* ---------- ficha: contadores sobem quando a grade entra na tela. O numero real ja esta
     no HTML (SEO e leitor de tela); o que anima e uma copia aria-hidden. */
  function ficha(el) {
    var nums = el.querySelectorAll('[data-mi-contador]')
    if (!nums.length || reduz.matches) return
    var r = el.getBoundingClientRect()
    if (r.top < window.innerHeight * 0.9) return // ja visivel ao carregar: nao pisca para zero
    var fmt = function (v, d) { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) }
    nums.forEach(function (n) { n.textContent = '0' })
    aoVer(el, function (dentro, obs) {
      if (!dentro) return
      obs.disconnect()
      var t0 = performance.now()
      nums.forEach(function (n, k) {
        var alvo = parseFloat(n.getAttribute('data-valor')), dec = parseInt(n.getAttribute('data-decimais') || '0', 10)
        var atraso = k * 120
        ;(function passo(t) {
          var p = Math.min(1, Math.max(0, (t - t0 - atraso) / 1600))
          n.textContent = p >= 1 ? fmt(alvo, dec) : fmt(Math.floor(alvo * EXPO(p)), 0)
          if (p < 1) requestAnimationFrame(passo)
        })(t0)
      })
    }, { threshold: 0.35 })
  }

  /* ---------- antes/depois: input range nativo cobre a figura (teclado, leitor de tela e
     toque de graca). Na primeira vez que aparece, a linha faz uma varredura de convite. */
  function antesDepois(el) {
    var input = el.querySelector('input[type="range"]')
    if (!input) return
    var mexeu = false
    var ant = el.getAttribute('data-rotulo-antes') || 'antes'
    function aplicar(v) {
      el.style.setProperty('--pos', v + '%')
      input.setAttribute('aria-valuetext', Math.round(v) + '% ' + ant)
    }
    input.addEventListener('input', function () { mexeu = true; aplicar(parseFloat(input.value)) })
    aplicar(parseFloat(input.value))
    if (reduz.matches) return
    aoVer(el, function (dentro, obs) {
      if (!dentro || mexeu) return
      obs.disconnect()
      var t0 = performance.now(), ks = [[0, 50], [600, 82], [1400, 18], [2100, 50]]
      ;(function passo(t) {
        if (mexeu) return
        var dt = t - t0, v = 50
        for (var i = 1; i < ks.length; i++) {
          if (dt <= ks[i][0]) { var a = ks[i - 1], b = ks[i], u = (dt - a[0]) / (b[0] - a[0]); u = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; v = a[1] + (b[1] - a[1]) * u; break }
        }
        input.value = v; aplicar(v)
        if (dt < ks[ks.length - 1][0]) requestAnimationFrame(passo)
      })(t0)
    }, { threshold: 0.5 })
  }

  /* ---------- revelacao: so precisa de JS quando o navegador nao tem scroll-driven */
  function revela(el) {
    if (reduz.matches) { el.classList.add('mi-visivel'); return }
    if (temScrollTimeline && !el.classList.contains('mi-mapa')) return
    aoVer(el, function (dentro, obs) { if (dentro) { el.classList.add('mi-visivel'); obs.disconnect() } }, { threshold: 0.2 })
  }

  function iniciar() {
    document.querySelectorAll('[data-mi-hero]').forEach(hero)
    document.querySelectorAll('[data-mi-scrub]').forEach(scrub)
    document.querySelectorAll('[data-mi-ficha]').forEach(ficha)
    document.querySelectorAll('[data-mi-ad]').forEach(antesDepois)
    document.querySelectorAll('.mi-revela, .mi-mapa').forEach(revela)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar)
  else iniciar()
})()
