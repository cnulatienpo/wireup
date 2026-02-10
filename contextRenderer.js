// contextRenderer.js

export function renderContextPanel(panelData) {
  const panel = document.getElementById("context-panel");
  panel.innerHTML = "";

  if (!panelData) return;

  panel.append(
    section("Current Focus", [
      line(`Operator: ${panelData.focus.operator}`),
      line(`Family: ${panelData.focus.family}`)
    ])
  );

  panel.append(
    section("What Kind of Thing This Is", [
      paragraph(panelData.identity)
    ])
  );

  if (panelData.signalStory.length) {
    panel.append(
      section(
        "How the Signal Behaves",
        list(panelData.signalStory)
      )
    );
  }

  if (panelData.warnings.length) {
    panel.append(
      section(
        "Watch Out For",
        list(panelData.warnings)
      )
    );
  }

  if (panelData.lenses.length) {
    panel.append(
      section(
        "Thinking Mode",
        list(panelData.lenses)
      )
    );
  }

  if (panelData.glossary.length) {
    panel.append(
      section(
        "Words in Play",
        panelData.glossary.map(
          g => line(`${g.term} — ${g.definition}`)
        )
      )
    );
  }

  panel.append(
    section(
      "Official Reference",
      [
        link(
          panelData.officialDocs.label,
          panelData.officialDocs.url
        )
      ]
    )
  );
}

function section(title, children) {
  const el = document.createElement("section");
  const h = document.createElement("h3");
  h.textContent = title;
  el.appendChild(h);

  children.forEach(c => el.appendChild(c));
  return el;
}

function paragraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function line(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div;
}

function list(items) {
  const ul = document.createElement("ul");
  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item;
    ul.appendChild(li);
  });
  return ul;
}

function link(label, url) {
  const a = document.createElement("a");
  a.textContent = label;
  a.href = url;
  a.target = "_blank";
  return a;
}
