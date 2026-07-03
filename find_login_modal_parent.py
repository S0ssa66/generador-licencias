from html.parser import HTMLParser

class ParentFinder(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        tag_id = attrs_dict.get('id')
        self.stack.append((tag, tag_id))
        if tag_id == 'login-modal':
            print("login-modal is inside:")
            for p_tag, p_id in self.stack[:-1]:
                print(f"  <{p_tag} id={p_id}>")

    def handle_endtag(self, tag):
        # simple pop
        for i in reversed(range(len(self.stack))):
            if self.stack[i][0] == tag:
                self.stack = self.stack[:i]
                break

with open('/Users/sossa/IA/generador-licencias/index.html', 'r') as f:
    html = f.read()

parser = ParentFinder()
parser.feed(html)
