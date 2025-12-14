(function() {
  $.Msg('🧪 track-scale.js starting');

  let trackedPanel = null;
  let targetShape = null;
  let prevScale = '';

  function findPanel() {
      const panel = $('#scaled_panel');
      if (panel && panel.IsValid && panel.IsValid()) {
          trackedPanel = panel;
          targetShape = panel.FindChildTraverse('target_shape');
          if (!targetShape || !targetShape.IsValid()) {
              $.Msg('⚠️ target_shape not found — retrying…');
              $.Schedule(0.1, findPanel);
              return;
          }
          $.Msg('✅ scaled_panel and target_shape found, starting to monitor');
          tick();
      } else {
          $.Msg('⚠️ scaled_panel not found — retrying…');
          $.Schedule(0.1, findPanel);
      }
  }

  function tick() {
      if (!trackedPanel || !trackedPanel.IsValid() || !targetShape || !targetShape.IsValid()) {
          $.Msg('⚠️ panel(s) invalidated — restarting search');
          trackedPanel = null;
          targetShape = null;
          findPanel();
          return;
      }

      const scaleStr =
          trackedPanel.style?.['pre-transform-scale2d'] ||
          trackedPanel.style?.preTransformScale2d ||
          trackedPanel.GetAttributeString('pre-transform-scale2d', 'none');

      if (scaleStr !== prevScale) {
          prevScale = scaleStr;
          $.Msg(`📏 scale = "${scaleStr}"`);

          // Parse values
          const parts = scaleStr.replace(',', ' ').split(' ');
          let x = parseFloat(parts[0]);
          let y = parseFloat(parts[1]);

          if (isNaN(x)) x = -1;
          if (isNaN(y)) y = x;

          // Scale formula: 100 * (1 + |scale|)
          const width = `${100 * (1 + Math.abs(x))}%`;
          const height = `${100 * (1 + Math.abs(y))}%`;

          targetShape.style.width = width;
          targetShape.style.height = height;

          $.Msg(`🎯 applied: width=${width}, height=${height}`);
      }

      $.Schedule(0.1, tick);
  }

  findPanel();
})();
