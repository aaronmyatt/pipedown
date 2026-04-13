// Projects SearchBar component
PD.components.SearchBar = {
  view: function () {
    return m("input.search-input", {
      type: "text",
      placeholder: "Search projects and pipes...",
      value: PD.state.searchQuery,
      oninput: function (e) {
        PD.state.searchQuery = e.target.value;
      },
    });
  },
};
