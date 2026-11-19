/* Four fictional teasers. Companies, numbers and quotes are made up for the demo. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.Teasers = f(); })(this, function () {
  return [
    { id: "harbor", name: "Project Harbor", desc: "Precision machined components for aerospace and medical OEMs",
      banker: "Lakeview Capital Advisors",
      text: "Founded in 1994, the Company is a US-based manufacturer of precision machined components serving aerospace and medical device OEMs from two facilities in Ohio. FY2025 revenue was $68.4 million with adjusted EBITDA of $11.2 million (16.4% margin). The Company serves more than 140 active customers. The owners are exploring strategic alternatives.",
      d: { sector: "Industrials", geo: "US", ebitda: 11.2, margin: 0.164, growth: null, control: null, topCustomer: null },
      src: { sector: "manufacturer of precision machined components", geo: "US-based … two facilities in Ohio", ebitda: "adjusted EBITDA of $11.2 million", margin: "(16.4% margin)" } },
    { id: "northline", name: "Project Northline", desc: "Revenue-cycle outsourcing for physician groups",
      banker: "Crescent Street Partners",
      text: "The Company provides outsourced billing and revenue-cycle services to 210 physician groups across the US Southeast. Revenue grew 24% in 2025 to $31.0 million; adjusted EBITDA was $4.6 million. No client represents more than 6% of revenue. The founder seeks a majority partner to fund expansion.",
      d: { sector: "Healthcare services", geo: "US", ebitda: 4.6, margin: 0.148, growth: 0.24, control: true, topCustomer: 0.06 },
      src: { sector: "outsourced billing and revenue-cycle services", geo: "across the US Southeast", ebitda: "adjusted EBITDA was $4.6 million", growth: "Revenue grew 24% in 2025", control: "seeks a majority partner", topCustomer: "No client represents more than 6%", margin: "$4.6M / $31.0M" } },
    { id: "maple", name: "Project Maple", desc: "Commercial facility maintenance in Ontario",
      banker: "Northbank Securities",
      text: "Headquartered in Toronto, the Company delivers contracted facility maintenance to commercial landlords. 2025 revenue: C$92.0 million (+9%); adjusted EBITDA: $13.8 million (15.0%). The largest customer is 11% of revenue and 78% of revenue is under multi-year contract. A sale of 100% of the equity is contemplated.",
      d: { sector: "Business services", geo: "Canada", ebitda: 13.8, margin: 0.15, growth: 0.09, control: true, topCustomer: 0.11 },
      src: { sector: "contracted facility maintenance", geo: "Headquartered in Toronto", ebitda: "adjusted EBITDA: $13.8 million", margin: "(15.0%)", growth: "(+9%)", control: "sale of 100% of the equity", topCustomer: "largest customer is 11% of revenue" } },
    { id: "cobalt", name: "Project Cobalt", desc: "Direct-to-consumer home fragrance brand",
      banker: "Pierce & Lowell",
      text: "The Company is a digitally native home-fragrance brand selling primarily through its own website and Amazon. Net revenue reached $54 million in 2025, up 31%, with EBITDA of $7.9 million.",
      d: { sector: "Consumer", geo: "US", ebitda: 7.9, margin: 0.146, growth: 0.31, control: null, topCustomer: null },
      src: { sector: "digitally native home-fragrance brand", geo: "Amazon (US)", ebitda: "EBITDA of $7.9 million", growth: "up 31%", margin: "$7.9M / $54M" } }
  ];
});
