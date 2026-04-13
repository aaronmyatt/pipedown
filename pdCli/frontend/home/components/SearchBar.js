// Home SearchBar component
PD.components.SearchBar = {
  view: function () {
    return m("input.search-input", {
      type: "text",
      placeholder: "Search pipes...",
      value: PD.state.searchQuery,
      oninput: function (e) {
        PD.state.searchQuery = e.target.value;
      },
    });
  },
};
