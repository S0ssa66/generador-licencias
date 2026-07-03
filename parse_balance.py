from html.parser import HTMLParser

class DivCounter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.div_count = 0
        self.in_payment_modal = False
        self.payment_modal_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag == 'div':
            attrs_dict = dict(attrs)
            if attrs_dict.get('id') == 'payment-modal':
                self.in_payment_modal = True
                self.payment_modal_depth = self.div_count
            
            if self.in_payment_modal:
                self.div_count += 1

    def handle_endtag(self, tag):
        if tag == 'div':
            if self.in_payment_modal:
                self.div_count -= 1
                if self.div_count == self.payment_modal_depth:
                    print("payment-modal closed properly!")
                    self.in_payment_modal = False

with open('/Users/sossa/IA/generador-licencias/index.html', 'r') as f:
    html = f.read()

parser = DivCounter()
parser.feed(html)
if parser.in_payment_modal:
    print(f"payment-modal NOT closed! Missing {parser.div_count - parser.payment_modal_depth} </div> tags.")
