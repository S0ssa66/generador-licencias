import urllib.request
from html.parser import HTMLParser

class ParentFinder(HTMLParser):
    def __init__(self, target_id):
        super().__init__()
        self.target_id = target_id
        self.stack = []
        self.found_parents = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        self.stack.append((tag, attrs_dict.get('id')))
        if attrs_dict.get('id') == self.target_id:
            self.found_parents = list(self.stack)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()
        else:
            # Self-closing tags or malformed HTML
            # Let's try to find the last matching tag and pop up to there
            for i in reversed(range(len(self.stack))):
                if self.stack[i][0] == tag:
                    self.stack = self.stack[:i]
                    break

url = "https://beatss.app"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
    parser = ParentFinder('login-modal')
    parser.feed(html)
    if parser.found_parents:
        print("Ancestry of login-modal:")
        for tag, id in parser.found_parents:
            print(f"<{tag} id={id}>")
    else:
        print("login-modal not found!")
except Exception as e:
    print("Error:", e)
